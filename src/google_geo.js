var request = require('request');
var utils = require('./utils');

var exports = module.exports = {};
// Address jQuery Validator
exports.addressValidator = function(addressStr, callback) {
  var token = process.env.GOOGLE_GEO_TOKEN;
  // console.log("Address string ");
  // console.log(addressStr);
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
          return;
        } else {
          var addressData = JSON.parse(response.body);
          if(addressData.status == "OK"){
            console.log('Get address ok');
            // addressData.results[0].address_components.forEach(function(entry) {
            //   console.log("each entry");
            //   console.log(entry);
            // });
            // console.log(addressData.results[0]);
            callback(addressData.results[0]);
            return;
          }
          // console.log(context);
        }
      });
  }else {
    callback();
    return;
  }

};
exports.getPostalCode = function(address_components, callback){
  var postalCode = null;
  // console.log(address);
  address_components.forEach(function(entry) {
      if(entry.types[0] == "postal_code"){
        postalCode = entry.short_name;
        return;
      }
  });
  callback(postalCode);
};
exports.formatAddressForScape = function(address_components, callback){
  var route = "";
  var street_number = "";
  var city = "";
  // var state = "";
  var address = "";
  address = street_number + " " + route + " " + city;
  var postalCode = null;

  address_components.forEach(function(entry) {
      console.log(entry);
      if(entry.types[0] == "postal_code"){
        postalCode = entry.short_name;
        return;
      }
      if(entry.types[0] == "street_number"){
        street_number = entry.short_name;
        return;
          // case "street_number":
          //     street_number = this.short_name;
          //     break;
          // case "route":
          //     route = this.short_name;
          //     break;
          // case "administrative_area_level_1":
          //     state = this.short_name;
          //     break;
          // case "locality":
          //     city = this.short_name;
          //     break;
      }
      if(entry.types[0] == "route"){
        route = entry.short_name;
        return;
      }
      // if(entry.types[0] == "administrative_area_level_1"){
      //   state = entry.short_name;
      //   return;
      // }
      if(entry.types[0] == "locality"){
        city = entry.short_name;
        return;
      }
  });

  address = street_number + " " + route + " " + city;
  console.log("after address=========");

  console.log(address);
  callback({"address": address, "zipcode": postalCode});
};
