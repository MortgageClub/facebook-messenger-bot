var request = require('request');
var utils = require('./utils');

var exports = module.exports = {};
// Address jQuery Validator
exports.addressValidator = function(addressStr, callback) {
  var token = process.env.GOOGLE_GEO_TOKEN;
  // console.log("RAILS URL : " + url);
  // console.log(context);
  if(utils.isDefined(addressStr)) {
    var url = "https://maps.googleapis.com/maps/api/geocode/json?address=" + addressStr + "&key=" + token;
    request({
        method: 'GET',
        uri: url
      },
      function(error, response, body) {
        if (error) {
          console.error('Error while get address by using Google Geocoder : ', error);
          callback();
        } else {
          var addressData = JSON.parse(response.body);
          if(addressData.status == "OK"){
            console.log('Get address ok');
            callback(addressData.results[0]);
          }
          // console.log(context);
        }
      });
  }else {
    callback();
  }

};
