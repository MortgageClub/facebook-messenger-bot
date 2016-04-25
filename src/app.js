'use strict';

const apiai = require('apiai');
const express = require('express');
const bodyParser = require('body-parser');
const uuid = require('node-uuid');
const request = require('request');
require('dotenv').config();

const REST_PORT = (process.env.PORT || 5000);
const APIAI_ACCESS_TOKEN = process.env.APIAI_ACCESS_TOKEN;
const APIAI_LANG = process.env.APIAI_LANG || 'en';
const FB_VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const HashMap = require('hashmap');

var map = new HashMap();

const apiAiService = apiai(APIAI_ACCESS_TOKEN, {
  language: APIAI_LANG
});
const sessionIds = new HashMap();
const defaultTimeout = 30000; //miliseconds
var welcome = "1100";
var usage = "1101";
var propertyType = "1102";
var downpayment = "5000";
var creditScoreCode = "5001";
var apiaiErrorCode = "9000";
var signupStr = "Do you want to apply for a mortgage now? (Yes/No)";
var waitingQuote = "I'm analyzing thousands of loan programs to find the best mortgage loans for you...";
var percentErrorStr = "Sorry, down payment must be at least 3.5%. Please enter it again.";
var creditScoreErrorStr = "Sorry, credit score must be between 620 and 850 (Hint: u can get your free credit score on CreditKarma).";
// purpose types
var btnPurposeTypes = [{
  "type": "postback",
  "title": "Purchase",
  "payload": "purchase"
}, {
  "type": "postback",
  "title": "Refinance",
  "payload": "refinance"
}];
/// usage
var btnUsage = [{
  "type": "postback",
  "title": "Primary Residence",
  "payload": "primary_residence"
}, {
  "type": "postback",
  "title": "Vacation Home",
  "payload": "vacation_home"
}, {
  "type": "postback",
  "title": "Rental Property",
  "payload": "rental_property"
}];
//single family home, duplex, triplex, fourplex, or condo

var btnPropertyTypes = [{
  "type": "postback",
  "title": "Single Family Home",
  "payload": "sfh"
}, {
  "type": "postback",
  "title": "Multi-Family",
  "payload": "multi_family"
}, {
  "type": "postback",
  "title": "Condo/Townhouse",
  "payload": "condo"
}];

map.set(welcome, btnPurposeTypes);
map.set(usage, btnUsage);
map.set(propertyType, btnPropertyTypes);

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
    // Handle a text message from this sender

    if (!sessionIds.get(sender)) {
      var sessionId = uuid.v1();
      sessionIds.set(sender, { sessionId: sessionId, ask_credit: false, ask_downpayment: false, timeout: Date.now() + defaultTimeout,  context: { conversation_id: sessionId, profile: {},  parameters: {}, resolved_queries: [] } } );
      getUserProfile(sender);
    }
    sessionIds.get(sender).timeout = Date.now() + defaultTimeout;
    /// check % or number of downpayment
    if(sessionIds.get(sender).ask_downpayment && !sessionIds.get(sender).context.parameters.down_payment){
      // console.log("ask down_payment = true and down_payment param is null");
      if(text.indexOf("%") > -1) {
        // console.log("content %");
        var numberArr = text.split("%");
        // console.log(numberArr);
        // console.log("Is number " + isNaN(numberArr[0]));
        if(!isNaN(numberArr[0])){
          var percent = parseFloat(numberArr[0], 10);
          // console.log("Parse float " + percent);

          if (3.5 <= percent && percent <= 100) {
            percent = percent/100;
            var property_value = parseFloat(sessionIds.get(sender).context.parameters.property_value);
            console.log("parse property_value " + property_value);
            console.log("percent/ 100 ");
            console.log(percent);
            text = percent * property_value;
            console.log("after calc");
            console.log(text);
            sessionIds.get(sender).ask_downpayment = false;
          }
          else {
            sendFBMessage(sender, sendTextMessage(percentErrorStr));
            return;
          }
        }
      }else {
        if(!isNaN(text)){
          var property_value = parseFloat(sessionIds.get(sender).context.parameters.property_value);
          if(parseFloat(text) < 0.035 * property_value){
            sendFBMessage(sender, sendTextMessage(percentErrorStr));
            return;
          }
        }
      }
    }
    if(sessionIds.get(sender).ask_credit && sessionIds.get(sender).context.parameters.credit_score){
      sessionIds.get(sender).ask_credit = false;
    }
    if(sessionIds.get(sender).ask_credit && !sessionIds.get(sender).context.parameters.credit_score){
      if(!isNaN(text)){
        var creditScore = parseFloat(text);
        if(creditScore < 620 ||  creditScore > 850){
          sendFBMessage(sender, sendTextMessage(creditScoreErrorStr));
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
      if (isDefined(response.result)) {

        let responseText = response.result.fulfillment.speech;
        let source = response.result.fulfillment.source;
        let action = response.result.action;
        sessionIds.get(sender).context.parameters = response.result.parameters;
        sessionIds.get(sender).context.resolved_queries.push({
          "question": responseText,
          "answer": response.result.resolvedQuery,
          "timestamp": response.timestamp
        });
        if (isDefined(source) && source === "MortgageClub") {
          // console.log("Get rates !!!")

          var rateData = JSON.parse(responseText);
          if (rateData.status_code == 200) {
            sendFBMessage(sender, sendTextMessage(waitingQuote));
            sendFBMessage(sender, sendGenericMessage(rateData.data));
            pushHistoryToServer(sender, sessionIds.get(sender).context);
            return;
          } else {
            sendFBMessage(sender, sendTextMessage(rateData.data));
            pushHistoryToServer(sender, sessionIds.get(sender).context);
            return;
          }
        }
        else if (isDefined(responseText)) {



          // console.log(sessionIds.get(sender));
          var arr = responseText.split("|");
          // console.log("Code :====== " + arr[0]);
          // console.log("Mess :====== " + arr[1]);
          if (isNaN(arr[0])) {
            // console.log('This is not number');
            sendFBMessage(sender, sendTextMessage(arr[0]));
            return;
          }else {
            if(arr[0] == welcome ){

              setTimeout(function() {
                if(sessionIds.get(sender)){
                  arr[1] = arr[1].slice(0, 5) + " "+sessionIds.get(sender).context.profile.first_name + arr[1].slice(5);
                  sendFBMessage(sender, sendButtonMessage(arr[1], map.get(arr[0])));
                }
              }, 2000);
              return;
            }

            if (arr[0] == downpayment) {
              sessionIds.get(sender).ask_downpayment = true;
              sendFBMessage(sender, sendTextMessage(arr[1]));
              return;
            }

            if (arr[0] == creditScoreCode) {
              sessionIds.get(sender).ask_credit = true;
              sendFBMessage(sender, sendTextMessage(arr[1]));
              return;
            }

            if (arr[0] == apiaiErrorCode) {
              sessionIds.remove(sender);
              sendFBMessage(sender, sendTextMessage(arr[1]));
              return;
            }

            sendFBMessage(sender, sendButtonMessage(arr[1], map.get(arr[0])));
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
function pushHistoryToServer(sender,context){
  var url = process.env.RAILS_URL + "facebook_webhooks/save_data";
  // console.log("RAILS URL : " + url);
  // console.log(context);

  request({
      method: 'POST',
      uri: url,
      json: context,
      headers: {
        "MORTGAGECLUB_FB": FB_VERIFY_TOKEN
      }
    },
    function(error, response, body) {
      if (error) {
        console.error('Error while pushing history : ', error);
      } else {
        sessionIds.remove(sender);
        console.log('History push ok');
        // console.log(context);
      }
    });
}
function sendTextMessage(textMessage) {
  return {
    text: textMessage
  }
}

function sendButtonMessage(text, buttons) {
  return {
    "attachment": {
      "type": "template",
      "payload": {
        "template_type": "button",
        "text": text,
        "buttons": buttons
      }
    }
  };
}

function sendGenericMessage(messages) {
  // console.log(messages);
  var messagesData = {
    "attachment": {
      "type": "template",
      "payload": {
        "template_type": "generic",
        "elements": []
      }
    }
  };
  // console.log(" Length of Generic " + messages.length);
  for (var i = 0; i < messages.length; i++) {

    var messageData = {
      "title": messages[i].title,
      "image_url": messages[i].img_url,
      "subtitle": messages[i].subtitle,
      "buttons": [{
        "type": "web_url",
        "url": messages[i].url,
        "title": "Get this rate"
      }]
    };
    messagesData['attachment']['payload']['elements'][i] = messageData;
  }
  return messagesData;
}
function setUpTimeout(sender, context){
  var setTimeoutVar = Date.now();
  // console.log("Settimeout : " + setTimeoutVar);
  setTimeout(function () {
    // console.log("=================When run settimeout : " + Date.now());
    if(sessionIds.get(sender)){
      // console.log("Timeout in session : " + sessionIds.get(sender).timeout);
      // console.log("Calc in set timeout : ");
      // console.log(Date.now() - sessionIds.get(sender).timeout);
      if((Date.now() - sessionIds.get(sender).timeout) >= 0 ){
        // console.log("Timeout push ===============");
        // console.log(context);
        pushHistoryToServer(sender,context);
        // console.log("after remove ");
        // console.log(sessionIds.get(sender));
      }
    }
  }, defaultTimeout);
}
function sendFBMessage(sender, messageData) {

  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: {
      access_token: FB_PAGE_ACCESS_TOKEN
    },
    method: 'POST',
    json: {
      recipient: {
        id: sender
      },
      message: messageData
    }
  }, function(error, response, body) {
    if (error) {
      console.log('Error sending message: ', error);
    } else if (response.body.error) {
      console.log('Error: ', response.body.error);
    }
  });
}

function doSubscribeRequest() {
  request({
      method: 'POST',
      uri: "https://graph.facebook.com/v2.6/me/subscribed_apps?access_token=" + FB_PAGE_ACCESS_TOKEN
    },
    function(error, response, body) {
      if (error) {
        console.error('Error while subscription: ', error);
      } else {
        console.log('Subscription result: ', response.body);
      }
    });
}

function isDefined(obj) {
  if (typeof obj == 'undefined') {
    return false;
  }

  if (!obj) {
    return false;
  }

  return obj != null;
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

    setTimeout(function() {
      doSubscribeRequest();
    }, 3000);
  } else {
    res.send('Error, wrong validation token');
  }
});
function getUserProfile(fbUserID){
  request({
      method: 'GET',
      uri: "https://graph.facebook.com/v2.6/"+ fbUserID +"?fields=first_name,last_name,profile_pic&access_token=" + FB_PAGE_ACCESS_TOKEN
    },
    function(error, response, body) {
      if (error) {
        console.error('Error while getting user profile: ', error);
      } else {
        sessionIds.get(fbUserID).context.profile = JSON.parse(response.body);
        // console.log('user profile: ', response.body);
        sessionIds.get(fbUserID).context.profile.facebook_id = fbUserID;
        // console.log('user profile: ', response.body);
      }
    });
}
app.post('/webhook', function(req, res) {
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

app.listen(REST_PORT, function() {
  console.log('Rest service ready on port ' + REST_PORT);
});

doSubscribeRequest();
