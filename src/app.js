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
//Page access token
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
// fb page ID
const FB_PAGE_ID = process.env.FB_PAGE_ID;

//// custom module
const utils = require('./utils.js');
const API_AI_CODE = require('./api_ai_code.js');
const FB_BTN = require('./fb_btn.js');

//connect to google geo for checking address
const googleGeo = require('./google_geo.js');
const HashMap = require('hashmap');
// store btn
var map = new HashMap();

// address queue to store address when users input (take 30s per request)
var addressQueue = new HashMap();

const apiAiService = apiai(APIAI_ACCESS_TOKEN, {
  language: APIAI_LANG
});
// store Session IDs with Facebook id
const sessionIds = new HashMap();
// default timeout for chat. After timeout, app will push history to Rails server and destroy Session
const defaultTimeout = 50000; //miliseconds

// message
var signupStr = "Do you want to apply for a mortgage now? (Yes/No)";
var waitingQuote = "I'm analyzing thousands of loan programs to find the best mortgage loans for you...";
var waitingAddress = "I'm checking your address...";

var percentErrorStr = "Sorry, down payment must be at least 3.5%. Please enter it again.";
var creditScoreErrorStr = "Sorry, credit score must be between 620 and 850 (Hint: u can get your free credit score on CreditKarma).";
var addressStr = "Sorry, Your address is not exist. Please try again !";

map.set(API_AI_CODE.welcome, FB_BTN.btnPurposeTypes);
map.set(API_AI_CODE.usage, FB_BTN.btnUsage);
map.set(API_AI_CODE.propertyType, FB_BTN.btnPropertyTypes);

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
            // console.log("parse property_value " + property_value);
            // console.log("percent/ 100 ");
            // console.log(percent);
            text = percent * property_value;
            // console.log("after calc");
            // console.log(text);
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
            if(utils.isDefined(response.result.parameters.mortgage_advisor) && response.result.parameters.mortgage_advisor == 1){
              googleGeo.addressValidator(response.result.parameters.address, function(data){
                if(utils.isDefined(data)){
                  // console.log("address after validator");
                  // console.log(data);
                  addressQueue.set(Date.now(),{data: data, facebook_id: sender });
                  sendFBMessage(sender, sendTextMessage(waitingAddress));
                  // console.log(addressQueue);
                  return;
                }else {
                  sendFBMessage(sender, sendTextMessage(addressStr));
                  return;
                }
              });
            }else {
              sendFBMessage(sender, sendTextMessage(arr[0]));
              return;
            }
          }else {
            if(arr[0] == API_AI_CODE.welcome ){

              setTimeout(function() {
                if(sessionIds.get(sender)){
                  arr[1] = arr[1].slice(0, 5) + " "+sessionIds.get(sender).context.profile.first_name + arr[1].slice(5);
                  sendFBMessage(sender, sendButtonMessage(arr[1], map.get(arr[0])));
                }
              }, 2000);
              return;
            }

            if (arr[0] == API_AI_CODE.downpayment) {
              sessionIds.get(sender).ask_downpayment = true;
              sendFBMessage(sender, sendTextMessage(arr[1]));
              return;
            }

            if (arr[0] == API_AI_CODE.creditScoreCode) {
              sessionIds.get(sender).ask_credit = true;
              sendFBMessage(sender, sendTextMessage(arr[1]));
              return;
            }

            if (arr[0] == API_AI_CODE.endApiAiConversation) {
              sendFBMessage(sender, sendTextMessage(arr[1]));
              getQuotes(sender, response.result);
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
  // googleGeo.addressValidator("2113 wendover ln, san jose", function(data){
  //   addressQueue.set(Date.now(),{data: data, facebook_id: "123123123" });
  //   // console.log(data);
  // });
  // googleGeo.addressValidator("18531 ALLENDALE AVE Saratoga", function(data){
  //   addressQueue.set(Date.now(),{data: data, facebook_id: "123123123" });
  //   // console.log(data);
  // });
  // googleGeo.addressValidator("41085 CANYON HEIGHTS DR FREMONT", function(data){
  //   addressQueue.set(Date.now(),{data: data, facebook_id: "123123123" });
  //   // console.log(data);
  // });
  // googleGeo.addressValidator("4549 PACIFIC RIM WAY San Jose", function(data){
  //   addressQueue.set(Date.now(),{data: data, facebook_id: "123123123" });
  //   // console.log(data);
  // });
  // googleGeo.addressValidator("6032 WHITEHAVEN CT, SAN JOSE", function(data){
  //   addressQueue.set(Date.now(),{data: data, facebook_id: "456456456" });
  //   // console.log(data);
  // });
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

function configWelcomeScreen() {
  var config = {
    "setting_type":"call_to_actions",
    "thread_state":"new_thread",
    "call_to_actions":[
      {
        "message":{
          "text":"Welcome to MortgageClub. Just say something to get started. I'm still in beta, so apologize in advance for the bugs. :)"
        }
      }
    ]
  };
  request({
      method: 'POST',
      uri: "https://graph.facebook.com/v2.6/"+ FB_PAGE_ID  +"/thread_settings?access_token=" + FB_PAGE_ACCESS_TOKEN,
      json: config
    },
    function(error, response, body) {
      if (error) {
        console.error('Error while config: ', error);
      } else {
        console.log('Conifg result: ', response.body);
      }
    });
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
    // configWelcomeScreen();
    setTimeout(function() {
      doSubscribeRequest();
      configWelcomeScreen();
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
function getQuotes(sender, parameters){
  var url = process.env.RAILS_URL + "facebook_webhooks/receive";
  // console.log("RAILS URL : " + url);
  // console.log(context);
  // console.log(parameters);
  request({
      method: 'POST',
      uri: url,
      json: parameters,
      headers: {
        "MORTGAGECLUB_FB": FB_VERIFY_TOKEN
      }
    },
    function(error, response, body) {
      if (error) {
        console.error('Error while getting quotes : ', error);
      } else {
        console.log('Get quotes ok');
        console.log(response.body);
        var rates = JSON.parse(response.body.speech);
        if(rates.status_code == 200 ){
          sendFBMessage(sender, sendGenericMessage(rates.data));
        }else {
          sendFBMessage(sender, sendTextMessage(rates.data));
        }
        pushHistoryToServer(sender, sessionIds.get(sender).context);
        return;
        // console.log(context);
      }
    });
}

function getRefinance(sender, data){
  var url = process.env.RAILS_URL + "facebook_webhooks/refinance";
  // console.log("RAILS URL : " + url);
  // console.log(context);
  // console.log(parameters);
  request({
      method: 'POST',
      uri: url,
      json: data,
      headers: {
        "MORTGAGECLUB_FB": FB_VERIFY_TOKEN
      }
    },
    function(error, response, body) {
      if (error) {
        console.error('Error while getting refinance : ', error);
      } else {
        console.log('Get refinance ok');
        console.log(response.body);
        console.log('Get refinance speech');

        console.log(response.body.speech);
        console.log('Get refinance Sender');
        console.log(sender);

        // var rates = JSON.parse(response.body.speech);
        // console.log(rates);
        if(response.body.speech.status_code == 200 ){
          // console.log(rates);
          sendFBMessage(sender, sendTextMessage("Lower rate refinance : New interest rate" + response.body.speech.lower_rate_refinance.new_interest_rate + " New monthly payment: " + response.body.speech.lower_rate_refinance.new_monthly_payment ));
          sendFBMessage(sender, sendTextMessage("Saving 1 year : " + response.body.speech.lower_rate_refinance.savings_1_year + " Saving 3 year: " + response.body.speech.lower_rate_refinance.savings_3_years  + " Saving 10 year: " + response.body.speech.lower_rate_refinance.savings_10_years ));
          sendFBMessage(sender, sendTextMessage("Cash out refinance : Current estimated value is " + response.body.speech.cash_out_refinance.current_home_value + " and you can take " + response.body.speech.cash_out_refinance.cash_out + " cash out at a low interest rate to invest in something else."));
        }else {
          sendFBMessage(sender, sendTextMessage("Have something wrong. Please try again!"));
        }
        // pushHistoryToServer(sender, sessionIds.get(sender).context);
        return;
      }
    });
}

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
app.get('/get-address', function(req, res){
  if(addressQueue.count() === 0){
    console.log("count = 0");
    res.status(404).json("Has no record");
    return;
  }
  var firstKey = addressQueue.keys()[0];
  var firstQueue = addressQueue.get(firstKey);
  console.log("count before remove");
  console.log(addressQueue.count());
  if(utils.isDefined(firstQueue)){
    googleGeo.formatAddressForScape(firstQueue.data.address_components, function(data){
      addressQueue.remove(firstKey);
      console.log("count after remove");
      console.log(addressQueue.count());
      console.log("Facebook ID : " + firstQueue.facebook_id );
      console.log("Zipcode ID : " + data.zipcode );
      res.status(200).json({"timestamp": firstKey, "address": data.address, "facebook_id":firstQueue.facebook_id, "zipcode": data.zipcode });
    });
    return;
  }else {
    res.status(404).json("Has no record");
    return;
  }
});
app.post('/scape-address', function(req, res){
  // var data = {
  //   "facebook_id": 123,
  //   "timestamp" : 123124124,
  //   "address": "6 World Way, Los Angeles, CA 90045",
  //   "owner_name": "Tang NV",
  //   "owner_name2": "Tang NV 3D",
  //   "mortgage_histories": [{
  //     "mortgage_date": "12/02/2010",
  //     "mortgage_amount": 500000,
  //     "mortgage_lender": "James Nguyen",
  //     "mortgage_code": "123",
  //     "mortgage_type": "house"
  //   }]
  // };

  if(utils.isDefined(req.body.error) && utils.isDefined(req.body.facebook_id)){
    console.log("error from ui path");
  }else {
    console.log("receive scape address data");
    console.log(req.body);
    getRefinance(req.body.facebook_id, req.body);
  }
});
app.listen(REST_PORT, function() {
  console.log('Rest service ready on port ' + REST_PORT);
});

doSubscribeRequest();
configWelcomeScreen();
