const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

// ................  Function calls .......................//
const checkPasswordValid = (password) => {
  const length = password.length;
  if (length < 6) {
    return false;
  } else {
    return true;
  }
};
// ................  Function calls .......................//

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3002, () => {
      console.log("Server running at http://localhost:3002/");
    });
  } catch (e) {
    console.log(`DB Error : ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

// ................  Middleware Functions .......................//

const statisticsOfTweet = async (obj) => {
  const tweetId = obj.tweet_id;
  console.log(tweetId, "....................................");
  const statsOfTweetQuery = `SELECT tweet.tweet ,
                                    COUNT(distinct like.like_id) as likes,
                                    COUNT(distinct reply.reply_id) as replies,
                                    tweet.date_time as dateTime 
                                FROM like INNER JOIN tweet
                                    ON like.tweet_id = tweet.tweet_id 
                                INNER JOIN reply 
                                    ON tweet.tweet_id = reply.tweet_id 
                                WHERE 
                                    tweet.tweet_id = ${tweetId}
                                GROUP BY tweet.tweet_id ;      
                             `;
  const tweetStatistics = await db.get(statsOfTweetQuery);
  return tweetStatistics;
};

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "WTF", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

// ................  Middleware Functions .......................//

// GET All Users for Test API (0)
//GET http://localhost:3000/users/
app.get("/users/", async (request, response) => {
  const userListGetQuery = `SELECT * FROM user;`;
  const userArray = await db.all(userListGetQuery);
  response.status(200);
  response.send(userArray);
});

// API 1 --- Path: `/register/` --- Method: `POST`
app.post(`/register/`, async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(getUserQuery);
  if (dbUser === undefined) {
    if (checkPasswordValid(password) === true) {
      const addUserQuery = `INSERT INTO user(username, password, name, gender)
                                VALUES('${username}','${hashedPassword}','${name}','${gender}');`;
      const dbResponse = await db.run(addUserQuery);
      response.status(200);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

// API 2 --- Path: `/login/` --- Method: `POST`
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(getUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const passwordMatched = await bcrypt.compare(password, dbUser.password);
    if (passwordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "WTF");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// API 3 --- Path: `/user/tweets/feed/` --- Method: `GET`
app.get(`/user/tweets/feed/`, authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(getUserQuery);
  const getTweetsQuery = `SELECT user.username, tweet, date_time as dateTime 
                                FROM user INNER JOIN tweet ON 
                                user.user_id = tweet.user_id 
                                INNER JOIN follower ON tweet.user_id = follower.following_user_id
                                WHERE follower.follower_user_id = '${dbUser.user_id}'
                                ORDER BY date_time DESC LIMIT 4;`;
  const tweets = await db.all(getTweetsQuery);
  response.send(tweets);
});

// API 4 --- Path: `/user/following/` --- Method: `GET`
app.get(`/user/following/`, authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(getUserQuery);
  const getUserFollowingQuery = `SELECT name FROM user INNER JOIN follower
                                      ON user.user_id = follower.following_user_id
                                      WHERE follower.follower_user_id = '${dbUser.user_id}';`;
  const names = await db.all(getUserFollowingQuery);
  response.send(names);
});

// API 5 --- Path: `/user/followers/` --- Method: `GET`
app.get(`/user/followers/`, authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(getUserQuery);
  const getUserFollowingQuery = `SELECT name FROM user INNER JOIN follower
                                      ON user.user_id = follower.follower_user_id
                                      WHERE follower.following_user_id = '${dbUser.user_id}';`;
  const names = await db.all(getUserFollowingQuery);
  response.send(names);
});

// API 6 --- Path: `/tweets/:tweetId/` --- Method: `GET`
app.get(`/tweets/:tweetId/`, authenticateToken, async (request, response) => {
  let { username } = request;
  const { tweetId } = request.params;

  const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(getUserQuery);

  const getTweetIdsQuery = `SELECT tweet_id FROM tweet INNER JOIN follower
                               ON tweet.user_id = follower.following_user_id
                               ;`;
  const tweetIds = await db.all(getTweetIdsQuery);
  let tweetIdsArray = [];
  for (let i of tweetIds) {
    if (tweetIdsArray.includes(i.tweet_id) === false) {
      tweetIdsArray.push(i.tweet_id);
    }
  }
  console.log(tweetIdsArray);
  if (tweetIdsArray.includes(parseInt(tweetId)) === true) {
    const getTweetDetailsQuery = `SELECT tweet.tweet,
                                     COUNT(DISTINCT like.like_id) as likes,
                                     COUNT(DISTINCT reply.reply_id) as replies,
                                     tweet.date_time as dateTime
                                FROM tweet INNER JOIN like ON like.tweet_id = tweet.tweet_id
                                INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
                                WHERE tweet.tweet_id = '${tweetId}';`;
    const tweetDetails = await db.get(getTweetDetailsQuery);
    response.send(tweetDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

// API 7 --- Path: `/tweets/:tweetId/likes/` --- Method: `GET`
app.get(
  `/tweets/:tweetId/likes/`,
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getTweetIdsQuery = `SELECT tweet_id FROM tweet INNER JOIN follower
                               ON tweet.user_id = follower.following_user_id
                               ;`;
    const tweetIds = await db.all(getTweetIdsQuery);
    let tweetIdsArray = [];
    for (let i of tweetIds) {
      if (tweetIdsArray.includes(i.tweet_id) === false) {
        tweetIdsArray.push(i.tweet_id);
      }
    }

    if (tweetIdsArray.includes(parseInt(tweetId)) === true) {
      const getUsersLikedQuery = `SELECT username FROM user INNER JOIN like
                                   ON user.user_id = like.user_id
                                   INNER JOIN tweet ON like.tweet_id = tweet.tweet_id
                                   WHERE tweet.tweet_id = ${tweetId};`;
      const userNamesList = await db.all(getUsersLikedQuery);
      let usernamesArray = [];
      for (name of userNamesList) {
        usernamesArray.push(name.username);
      }
      const resultObject = { likes: usernamesArray };
      response.send(resultObject);
      //console.log(resultObject);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

// API 8 --- Path: `/tweets/:tweetId/replies/` --- Method: `GET`
app.get(
  `/tweets/:tweetId/replies/`,
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getTweetIdsQuery = `SELECT tweet_id FROM tweet INNER JOIN follower
                               ON tweet.user_id = follower.following_user_id
                               ;`;
    const tweetIds = await db.all(getTweetIdsQuery);
    let tweetIdsArray = [];
    for (let i of tweetIds) {
      if (tweetIdsArray.includes(i.tweet_id) === false) {
        tweetIdsArray.push(i.tweet_id);
      }
    }
    if (tweetIdsArray.includes(parseInt(tweetId)) === true) {
      const getUsersRepliesQuery = `SELECT name, reply.reply FROM user INNER JOIN reply
                                   ON user.user_id = reply.user_id
                                   INNER JOIN tweet ON reply.tweet_id = tweet.tweet_id
                                   WHERE tweet.tweet_id = ${tweetId};`;
      const replyDetailsList = await db.all(getUsersRepliesQuery);
      const resultObject = { replies: replyDetailsList };
      response.send(resultObject);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

// API 9 --- Path: `/user/tweets/` --- Method: `GET`

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  console.log(username);
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(getUserQuery);
  const userId = dbUser.user_id;
  const getAllTweetsOfUserQuery = `SELECT tweet_id FROM tweet 
                                    WHERE user_id=${userId};`;
  const tweetIdArray = await db.all(getAllTweetsOfUserQuery);
  console.log(tweetIdArray);
  // const tweetStatisticsArray = await tweetIdArray.map(statisticsOfTweet);
  let tweetStatisticsArray = [];
  for (let obj of tweetIdArray) {
    tweetStatisticsArray.push(await statisticsOfTweet(obj));
  }
  response.send(tweetStatisticsArray);
});

// API 10 --- Path: `/user/tweets/` --- Method: `POST`
app.post(`/user/tweets/`, authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const addTweetQuery = `INSERT INTO tweet(tweet)
                            VALUES('${tweet}');`;
  const dbResponse = await db.run(addTweetQuery);
  response.send("Created a Tweet");
});

// API 11 --- Path: `/tweets/:tweetId/` --- Method: `DELETE`
app.delete(
  `/tweets/:tweetId/`,
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
    const dbUser = await db.get(getUserQuery);

    const getTweetDetailsQry = `SELECT * FROM tweet WHERE tweet_id = ${tweetId};`;
    const tweetObject = await db.get(getTweetDetailsQry);
    console.log(tweetObject);

    if (dbUser.user_id === tweetObject.user_id) {
      const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id = ${tweetId};`;
      const dbResponse = await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }

    // if (tweetIdsArray.includes(parseInt(tweetId)) === true) {
    //   const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id = ${tweetId};`;
    //   const dbResponse = await db.run(deleteTweetQuery);
    //   response.send("Tweet Removed");
    // } else {
    //   response.status(401);
    //   response.send("Invalid Request");
    // }
  }
);

module.exports = app;
