'use strict';

const apiai = require('apiai');
const express = require('express');
const bodyParser = require('body-parser');
const uuid = require('node-uuid');
const request = require('request');

// config env
require('dotenv').config();

// PORT
const REST_PORT = (process.env.PORT || 5000);

//API AI TOKEN
const APIAI_ACCESS_TOKEN = process.env.APIAI_ACCESS_TOKEN;
// Lang for Api Ai
const APIAI_LANG = process.env.APIAI_LANG || 'en';
//facebook verify token
const FB_VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;


//// custom module
const utils = require('./utils.js');
const API_AI_CODE = require('./api_ai_code.js');
const FB_BTN = require('./fb_btn.js');
var fbServices = require('./fb_services.js');

//connect to google geo for checking address
const googleGeo = require('./google_geo.js');
const HashMap = require('hashmap');
// store btn
var mapFbBtn = new HashMap();

// address queue to store address when users input (take 30s per request)
var addressQueue = new HashMap();

const apiAiService = apiai(APIAI_ACCESS_TOKEN, {
  language: APIAI_LANG
});
// store Session IDs with Facebook id
const sessionIds = new HashMap();
// default timeout for chat. After timeout, app will push history to Rails server and destroy Session
const defaultTimeout = process.env.DEFAULT_TIMEOUT; //miliseconds

// message
var signupStr = "Do you want to apply for a mortgage now? (Yes/No)";
var waitingQuote = "I'm analyzing thousands of loan programs to find the best mortgage loans for you...";
var waitingAddress = "I'm checking your address...";

var percentErrorStr = "Sorry, down payment must be at least 3.5%. Please enter it again.";
var creditScoreErrorStr = "Sorry, credit score must be between 620 and 850 (Hint: u can get your free credit score on CreditKarma).";
var addressStr = "Sorry, Your address is not exist. Please try again !";

mapFbBtn.set(API_AI_CODE.welcome, FB_BTN.btnPurposeTypes);
mapFbBtn.set(API_AI_CODE.usage, FB_BTN.btnUsage);
mapFbBtn.set(API_AI_CODE.propertyType, FB_BTN.btnPropertyTypes);

function processEvent(event) {
  var sender = event.sender.id;
  var text = null;
  if (event.message && event.message.text) {
    text = event.message.text;
  } else
  if (event.postback && event.postback.payload) {
    text = event.postback.payload;
  }
  if (text) {
    // Handle a text message from this sender - before sending to Api ai

    if (!sessionIds.get(sender)) {
      var sessionId = uuid.v1();
      sessionIds.set(sender, {
        sessionId: sessionId,
        ask_credit: false,
        ask_downpayment: false,
        timeout: Date.now() + defaultTimeout,
        context: {
          conversation_id: sessionId,
          profile: {},
          parameters: {},
          resolved_queries: []
        }
      });
      fbServices.getUserProfile(sender);
    }
    sessionIds.get(sender).timeout = Date.now() + defaultTimeout;
    /// check % or number of downpayment
    if (sessionIds.get(sender).ask_downpayment && !sessionIds.get(sender).context.parameters.down_payment) {
      // console.log("ask down_payment = true and down_payment param is null");
      if (text.indexOf("%") > -1) {
        // console.log("content %");
        var numberArr = text.split("%");
        // console.log(numberArr);
        // console.log("Is number " + isNaN(numberArr[0]));
        if (!isNaN(numberArr[0])) {
          var percent = parseFloat(numberArr[0], 10);
          // console.log("Parse float " + percent);

          if (3.5 <= percent && percent <= 100) {
            percent = percent / 100;
            var property_value = parseFloat(sessionIds.get(sender).context.parameters.property_value);
            // console.log("parse property_value " + property_value);
            // console.log("percent/ 100 ");
            // console.log(percent);
            text = percent * property_value;
            // console.log("after calc");
            // console.log(text);
            sessionIds.get(sender).ask_downpayment = false;
          } else {
            fbServices.sendFBMessage(sender, fbServices.textMessage(percentErrorStr));
            return;
          }
        }
      } else {
        if (!isNaN(text)) {
          var property_value = parseFloat(sessionIds.get(sender).context.parameters.property_value);
          if (parseFloat(text) < 0.035 * property_value) {
            fbServices.sendFBMessage(sender, fbServices.textMessage(percentErrorStr));
            return;
          }
        }
      }
    }
    if (sessionIds.get(sender).ask_credit && sessionIds.get(sender).context.parameters.credit_score) {
      sessionIds.get(sender).ask_credit = false;
    }
    if (sessionIds.get(sender).ask_credit && !sessionIds.get(sender).context.parameters.credit_score) {
      if (!isNaN(text)) {
        var creditScore = parseFloat(text);
        if (creditScore < 620 || creditScore > 850) {
          fbServices.sendFBMessage(sender, fbServices.textMessage(creditScoreErrorStr));
          return;
        }
      }
    }
    // console.log("Fb messages === " + text);

    let apiaiRequest = apiAiService.textRequest(text, {
      sessionId: sessionIds.get(sender).sessionId
    });
    apiaiRequest.on('response', (response) => {
      // console.log("Response API AI ========== ");
      // console.log(response);

      setUpTimeout(sender, sessionIds.get(sender).context);
      if (utils.isDefined(response.result)) {

        let responseText = response.result.fulfillment.speech;
        let source = response.result.fulfillment.source;
        let action = response.result.action;
        sessionIds.get(sender).context.parameters = response.result.parameters;
        sessionIds.get(sender).context.resolved_queries.push({
          "question": responseText,
          "answer": response.result.resolvedQuery,
          "timestamp": response.timestamp
        });

        if (utils.isDefined(responseText)) {
          // console.log(sessionIds.get(sender));
          var arr = responseText.split("|");
          // console.log("Code :====== " + arr[0]);
          // console.log("Mess :====== " + arr[1]);
          if (isNaN(arr[0])) {
            // console.log('This is not number');
            if (utils.isDefined(response.result.parameters.mortgage_advisor) && response.result.parameters.mortgage_advisor == 1) {
              googleGeo.addressValidator(response.result.parameters.address, function(data) {
                if (utils.isDefined(data)) {
                  // console.log("address after validator");
                  // console.log(data);
                  addressQueue.set(Date.now(), {
                    data: data,
                    facebook_id: sender
                  });
                  fbServices.sendFBMessage(sender, fbServices.textMessage(waitingAddress));
                  // console.log(addressQueue);
                  return;
                } else {
                  fbServices.sendFBMessage(sender, fbServices.textMessage(addressStr));
                  return;
                }
              });
            } else {
              fbServices.sendFBMessage(sender, fbServices.textMessage(arr[0]));
              return;
            }
          } else {
            if (arr[0] == API_AI_CODE.welcome) {

              setTimeout(function() {
                if (sessionIds.get(sender)) {
                  arr[1] = arr[1].slice(0, 5) + " " + sessionIds.get(sender).context.profile.first_name + arr[1].slice(5);
                  fbServices.sendFBMessage(sender, fbServices.buttonMessage(arr[1], mapFbBtn.get(arr[0])));
                }
              }, 2000);
              return;
            }

            if (arr[0] == API_AI_CODE.downpayment) {
              sessionIds.get(sender).ask_downpayment = true;
              fbServices.sendFBMessage(sender, fbServices.textMessage(arr[1]));
              return;
            }

            if (arr[0] == API_AI_CODE.creditScoreCode) {
              sessionIds.get(sender).ask_credit = true;
              fbServices.sendFBMessage(sender, fbServices.textMessage(arr[1]));
              return;
            }

            if (arr[0] == API_AI_CODE.endApiAiConversation) {
              fbServices.sendFBMessage(sender, fbServices.textMessage(arr[1]));
              getQuotes(sender, response.result);
              return;
            }

            fbServices.sendFBMessage(sender, fbServices.buttonMessage(arr[1], mapFbBtn.get(arr[0])));
            return;



          }
        }
      }
    });

    apiaiRequest.on('error', function(error) {
      console.error(error);
    });
    apiaiRequest.end();
  }
}




function setUpTimeout(sender, context) {
  var setTimeoutVar = Date.now();
  // console.log("Settimeout : " + setTimeoutVar);
  setTimeout(function() {
    // console.log("=================When run settimeout : " + Date.now());
    if (sessionIds.get(sender)) {
      // console.log("Timeout in session : " + sessionIds.get(sender).timeout);
      // console.log("Calc in set timeout : ");
      // console.log(Date.now() - sessionIds.get(sender).timeout);
      if ((Date.now() - sessionIds.get(sender).timeout) >= 0) {
        // console.log("Timeout push ===============");
        // console.log(context);
        // pushHistoryToServer(sender, context);
        // console.log("after remove ");
        // console.log(sessionIds.get(sender));
      }
    }
  }, defaultTimeout);
}







const app = express();
app.use(bodyParser.json());
app.all('*', function(req, res, next) {
  // res.header("Access-Control-Allow-Origin", '*');
  // res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, content-type, accept");
  next();
});

app.get('/webhook/', function(req, res) {
  if (req.query['hub.verify_token'] == FB_VERIFY_TOKEN) {
    res.send(req.query['hub.challenge']);
    // fbServices.configWelcomeScreen();
    setTimeout(function() {
      fbServices.doSubscribeRequest();
      fbServices.configWelcomeScreen();
    }, 1000);
  } else {
    res.send('Error, wrong validation token');
  }
});

app.post('/webhook', function(req, res) {
  // console.log(req);
  try {
    var messaging_events = req.body.entry[0].messaging;
    for (var i = 0; i < messaging_events.length; i++) {
      var event = req.body.entry[0].messaging[i];
      processEvent(event);
    }
    return res.status(200).json({
      status: "ok"
    });
  } catch (err) {
    return res.status(400).json({
      status: "error",
      error: err
    });
  }

});
app.get('/get-address', function(req, res) {
  if (addressQueue.count() === 0) {
    console.log("count = 0");
    res.status(404).json("Has no record");
    return;
  }
  var firstKey = addressQueue.keys()[0];
  var firstQueue = addressQueue.get(firstKey);
  console.log("count before remove");
  console.log(addressQueue.count());
  if (utils.isDefined(firstQueue)) {
    googleGeo.formatAddressForScape(firstQueue.data.address_components, function(data) {
      addressQueue.remove(firstKey);
      console.log("count after remove");
      console.log(addressQueue.count());
      console.log("Facebook ID : " + firstQueue.facebook_id);
      console.log("Zipcode ID : " + data.zipcode);
      res.status(200).json({
        "timestamp": firstKey,
        "address": data.address,
        "facebook_id": firstQueue.facebook_id,
        "zipcode": data.zipcode
      });
    });
    return;
  } else {
    res.status(404).json("Has no record");
    return;
  }
});

app.post('/scape-address', function(req, res) {

  if (utils.isDefined(req.body.error) || !utils.isDefined(req.body.facebook_id)) {
    console.log("error from ui path");
  } else {
    console.log("receive scape address data");
    console.log(req.body);
    getRefinance(req.body.facebook_id, req.body);
  }
});
app.listen(REST_PORT, function() {
  console.log('Rest service ready on port ' + REST_PORT);
});

fbServices.doSubscribeRequest();
fbServices.configWelcomeScreen();
