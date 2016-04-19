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

const apiAiService = apiai(APIAI_ACCESS_TOKEN, {language: APIAI_LANG});
const sessionIds = new Map();

function processEvent(event) {
    var sender = event.sender.id;
    var text = null;
    if (event.message && event.message.text) {
      text = event.message.text;
    } else
    if (event.postback && event.postback.payload ) {
      text = event.postback.payload
    }
    if(text) {
      // Handle a text message from this sender

      if (!sessionIds.has(sender)) {
          sessionIds.set(sender, uuid.v1());
      }

      console.log("Text", text);

      let apiaiRequest = apiAiService.textRequest(text,
          {
              sessionId: sessionIds.get(sender)
          });

      apiaiRequest.on('response', (response) => {
        console.log(response);

          if (isDefined(response.result)) {

              let responseText = response.result.fulfillment.speech;
              let source = response.result.fulfillment.source;
              // if(isDefined(source)){
              //   sendFBMessage(sender, {text: "wait for a minute!"});
              //   console.log(sendGenericMessage(JSON.parse(responseText)));
              // }
              // let responseData = response.result.fulfillment.data;
              let action = response.result.action;

              // if (isDefined(responseData) && isDefined(responseData.facebook)) {
              //     try {
              //         console.log('Response as formatted message');
              //         sendFBMessage(sender, responseData.facebook);
              //     } catch (err) {
              //         sendFBMessage(sender, {text: err.message });
              //     }
              // } else
              if (isDefined(responseText)) {
                  console.log('Response as text message');
                  if(response.result.parameters.down_payment != "" && response.result.parameters.usage == ""){
                    sendFBMessage(sender, sendButtonMessage(responseText, btnProperties));
                  }else
                  if(response.result.parameters.usage != "" && response.result.parameters.property_type == ""){
                    sendFBMessage(sender, sendButtonMessage(responseText, btnPropertyTypes));
                  }else
                  if(action === "loan.purpose"){
                    sendFBMessage(sender, sendButtonMessage(responseText, btnPurposeTypes));
                  }else
                  if(isDefined(source)){
                    sendFBMessage(sender, sendGenericMessage(JSON.parse(responseText)));
                  }else {
                    sendFBMessage(sender, {text: responseText});
                  }
              }

          }
      });

      apiaiRequest.on('error', function (error) { console.error(error);} );
      apiaiRequest.end();
    }
}
// purpose types
var btnPurposeTypes = [
  {
    "type":"postback",
    "title":"Purchase",
    "payload":"purchase"
  },
  {
    "type":"postback",
    "title":"Refinance",
    "payload":"refinance"
  }
];
//single family home, duplex, triplex, fourplex, or condo
var btnProperties = [
 {
   "type":"postback",
   "title":"Primary Residence",
   "payload":"primary_residence"
 },
 {
   "type":"postback",
   "title":"Vacation Home",
   "payload":"vacation_home"
 },
 {
   "type":"postback",
   "title":"Rental Property",
   "payload":"rental_property"
 }
];

var btnPropertyTypes = [
 {
   "type":"postback",
   "title":"Single Family Home",
   "payload":"sfh"
 },
 {
   "type":"postback",
   "title":"Multi-Family",
   "payload":"multi_family"
 },
 {
   "type":"postback",
   "title":"Condo/Townhouse",
   "payload":"condo"
 }
];

function sendButtonMessage(text, buttons) {
  return {
    "attachment":{
      "type":"template",
      "payload":{
        "template_type":"button",
        "text": text,
        "buttons": buttons
      }
    }
  };
}
function sendGenericMessage(messages){
  var messagesData = {
    "attachment":{
      "type":"template",
      "payload":{
        "template_type":"generic",
        "elements":[]
      }
    }
  };
  console.log(messages.length);
  for(var i = 0; i< messages.length;i++){

    var messageData = {
      "title": messages[i].title,
      "image_url":messages[i].img_url,
      "subtitle": messages[i].subtitle,
      "buttons":[
        {
          "type":"web_url",
          "url":messages[i].url,
          "title":"Get this rate"
        }
      ]
    };
    messagesData['attachment']['payload']['elements'][i] = messageData;
  }
  return messagesData;
}
function test(){
  var data = '[{"title":"3.350% APR","subtitle":"Monthly Payment: $1,607, Estimated Closing Cost: $1,954","url":"http://localhost:4000/quotes/MColEK3w?program=30yearFixed","type":"30yearFixed"},{"title":"2.750% APR","subtitle":"Monthly Payment: $2,477, Estimated Closing Cost: $1,954","url":"http://localhost:4000/quotes/MColEK3w?program=15yearFixed","type":"15yearFixed"},{"title":"2.500% APR","subtitle":"Monthly Payment: $1,432, Estimated Closing Cost: $1,954","url":"http://localhost:4000/quotes/MColEK3w?program=5yearARM","type":"5yearARM"}]';
}
function sendFBMessage(sender, messageData) {
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token: FB_PAGE_ACCESS_TOKEN},
        method: 'POST',
        json: {
            recipient: {id: sender},
            message: messageData
        }
    }, function (error, response, body) {
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
        function (error, response, body) {
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
app.all('*', function (req, res, next) {
    // res.header("Access-Control-Allow-Origin", '*');
    // res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, content-type, accept");
    next();
});

app.get('/webhook/', function (req, res) {
    if (req.query['hub.verify_token'] == FB_VERIFY_TOKEN) {
        res.send(req.query['hub.challenge']);

        setTimeout(function () {
            doSubscribeRequest();
        }, 3000);
    } else {
        res.send('Error, wrong validation token');
    }
});

app.post('/webhook', function (req, res) {
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

app.listen(REST_PORT, function () {
    console.log('Rest service ready on port ' + REST_PORT);
});

doSubscribeRequest();
