var request = require('request');
var utils = require('./utils');
var fbServices = require('./fb_services');

const RAILS_URL = process.env.RAILS_URL;
const FB_VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;


function getQuotes(sender, parameters, callback){
  var url = RAILS_URL + "facebook_webhooks/receive";
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
        callback(error);
        return;
      } else {
        console.log('Get quotes ok');
        console.log(response.body);
        var rates = JSON.parse(response.body.speech);
        if(rates.status_code == 200 ){
          fbServices.sendFBMessage(sender, fbServices.genericMessage(rates.data));
        }else {
          fbServices.sendFBMessage(sender, fbServices.textMessage(rates.data));
        }
        callback(null);
        return;
        // console.log(context);
      }
    });
}

function getRefinance(data, callback){
  var url = RAILS_URL + "facebook_webhooks/refinance";
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
        callback(error);
        return;
      } else {
        callback(null, response.body);
        return;
      }
    });
}


module.exports = {
  getRefinance: getRefinance,
  getQuotes: getQuotes
};
