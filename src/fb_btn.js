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
module.exports = {
  btnPropertyTypes: btnPropertyTypes,
  btnUsage: btnUsage,
  btnPurposeTypes: btnPurposeTypes
};
