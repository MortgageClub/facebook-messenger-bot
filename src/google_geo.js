var request = require('request');
var utils = require('./utils');
var GOOGLE_GEO_TOKEN = process.env.GOOGLE_GEO_TOKEN;
var exports = module.exports = {};

exports.addressValidator = function(addressStr, callback) {
  if (utils.isDefined(addressStr)) {
    var url = "https://maps.googleapis.com/maps/api/geocode/json?address=" + addressStr + "&key=" + GOOGLE_GEO_TOKEN;
    request({
        method: 'GET',
        uri: url
      },
      function(error, response, body) {
        if (error) {
          console.error('Error while get address by using Google Geocoder : ', error);
          callback();
          return;
        } else {
          var addressData = JSON.parse(response.body);
          if (addressData.status == "OK") {
            console.log('Get address ok');
            callback(addressData.results[0]);
            return;
          }
        }
      });
  } else {
    callback();
    return;
  }

};

exports.formatAddressForScape = function(address_components, callback) {
  var route = "";
  var street_number = "";
  var city = "";
  // var state = "";
  var address = "";
  address = street_number + " " + route + " " + city;
  var postalCode = null;

  address_components.forEach(function(entry) {
    console.log(entry);
    if (entry.types[0] == "postal_code") {
      postalCode = entry.short_name;
      return;
    }
    if (entry.types[0] == "street_number") {
      street_number = entry.short_name;
      return;
    }
    if (entry.types[0] == "route") {
      route = entry.short_name;
      return;
    }
    if (entry.types[0] == "locality") {
      city = entry.short_name;
      return;
    }
  });

  address = street_number + " " + route + " " + city;
  console.log("after address=========");

  console.log(address);
  callback({
    "address": address,
    "zipcode": postalCode
  });
};
