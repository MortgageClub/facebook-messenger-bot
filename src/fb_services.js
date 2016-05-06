var request = require('request');

//Page access token
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
// fb page ID
const FB_PAGE_ID = process.env.FB_PAGE_ID;

/**
 * [textMessage description]
 * @method textMessage
 * @param  {[type]}    message [description]
 * @return {[type]}            [description]
 */
function textMessage(message) {
  return {
    text: message
  };
}
/**
 * [buttonMessage description]
 * @method buttonMessage
 * @param  {[type]}      text    [description]
 * @param  {[type]}      buttons [description]
 * @return {[type]}              [description]
 */
function buttonMessage(text, buttons) {
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
/**
 * [genericMessage description]
 * @method genericMessage
 * @param  {[type]}       messages [description]
 * @return {[type]}                [description]
 */
function genericMessage(messages) {
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
/**
 * [sendFBMessage description]
 * @method sendFBMessage
 * @param  {[type]}      sender               [description]
 * @param  {[type]}      messageData          [description]
 * @param  {[type]}      FB_PAGE_ACCESS_TOKEN [description]
 * @return {[type]}                           [description]
 */
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
/**
 * [configWelcomeScreen description]
 * @method configWelcomeScreen
 * @param  {[string]}            FB_PAGE_ID           [facebook page id of bot]
 * @param  {[string]}            FB_PAGE_ACCESS_TOKEN [description]
 */
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

function getUserProfile(fbUserID, callback){
  request({
      method: 'GET',
      uri: "https://graph.facebook.com/v2.6/"+ fbUserID +"?fields=first_name,last_name,profile_pic&access_token=" + FB_PAGE_ACCESS_TOKEN
    },
    function(error, response, body) {
      if (error) {
        console.error('Error while getting user profile: ', error);
        callback();
        return;
      } else {
        // sessionIds.get(fbUserID).context.profile = JSON.parse(response.body);
        // console.log('user profile: ', response.body);
        callback(response.body);
        return;
        // sessionIds.get(fbUserID).context.profile.facebook_id = fbUserID;
        // console.log('user profile: ', response.body);
      }
    });
};

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

module.exports = {
  genericMessage: genericMessage,
  textMessage: textMessage,
  buttonMessage: buttonMessage,
  sendFBMessage: sendFBMessage,
  doSubscribeRequest: doSubscribeRequest,
  configWelcomeScreen: configWelcomeScreen,
  getUserProfile: getUserProfile
};
