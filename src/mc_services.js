var request = require('request');
var utils = require('./utils');
var fbServices = require('./fb_services');

const RAILS_URL = process.env.RAILS_URL;
const FB_VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;


function getQuotes(sender, parameters){
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
      } else {
        console.log('Get quotes ok');
        console.log(response.body);
        var rates = JSON.parse(response.body.speech);
        if(rates.status_code == 200 ){
          fbServices.sendFBMessage(sender, fbServices.genericMessage(rates.data));
        }else {
          fbServices.sendFBMessage(sender, fbServices.textMessage(rates.data));
        }
        // pushHistoryToServer(sender, sessionIds.get(sender).context);
        return;
        // console.log(context);
      }
    });
}

function getRefinance(sender, data){
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
      } else {
        console.log('Get refinance ok');
        console.log(response.body);
        console.log('Get refinance speech');
        if(utils.isDefined(response.body) && utils.isDefined(response.body.speech)) {
          console.log(response.body.speech);
          console.log('Get refinance Sender');
          console.log(sender);

          // var rates = JSON.parse(response.body.speech);
          // console.log(rates);
          if(response.body.speech.status_code == 200 ){
            // console.log(rates);
            fbServices.sendFBMessage(sender, fbServices.textMessage("Lower rate refinance : New interest rate" + response.body.speech.lower_rate_refinance.new_interest_rate + " New monthly payment: " + response.body.speech.lower_rate_refinance.new_monthly_payment ));
            fbServices.sendFBMessage(sender, fbServices.textMessage("Saving 1 year : " + response.body.speech.lower_rate_refinance.savings_1_year + " Saving 3 year: " + response.body.speech.lower_rate_refinance.savings_3_years  + " Saving 10 year: " + response.body.speech.lower_rate_refinance.savings_10_years ));
            fbServices.sendFBMessage(sender, fbServices.textMessage("Cash out refinance : Current estimated value is " + response.body.speech.cash_out_refinance.current_home_value + " and you can take " + response.body.speech.cash_out_refinance.cash_out + " cash out at a low interest rate to invest in something else."));
          }else {
            fbServices.sendFBMessage(sender, fbServices.textMessage("Have something wrong. Please try again!"));
          }
        }

        // pushHistoryToServer(sender, sessionIds.get(sender).context);
        return;
      }
    });
}

function pushHistoryToServer(sender,context){
  var url = RAILS_URL + "facebook_webhooks/save_data";
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

module.exports = {
  getRefinance: getRefinance,
  getQuotes: getQuotes,
  pushHistoryToServer: pushHistoryToServer
};
