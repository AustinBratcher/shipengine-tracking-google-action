'use strict';

process.env.DEBUG = 'actions-on-google:*';
const App = require('actions-on-google').DialogflowApp;
const functions = require('firebase-functions');
const ShipEngine = require('shipengine'); 

var engine = new ShipEngine.ShipEngine(functions.config().shipengine.api_key); 


// a. the action name from the make_name Dialogflow intent
const TRACK_ACTION = 'track_package';

// b. the parameters that are parsed from the make_name intent 
const CARRIER_ARGUMENT = 'carrier';
const NUMBER_ARGUMENT = 'number';

const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']; 
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']; 


exports.shipEngineTracker = functions.https.onRequest((request, response) => {
    const app = new App({request, response});
    console.log('Request headers: ' + JSON.stringify(request.headers));
    console.log('Request body: ' + JSON.stringify(request.body));

    let buildTrackingStatement = function(carrier, trackingData) {
        let statement = ''; 

        // AC: As of <TIME>, <carrier> said your package has been accepted in <CITY, ST, ZIP> . 
        // IT: As of <TIME>, <carrier> said your package is currently in transit in <CITY, TX>. 
        // DE: As of <TIME>, <carrier> said your item was delivered in <CITY, TX> . 
        // EX: Sorry, an exception occured while trying to gather tracking information. Please try again later. 
        // UN: Sorry, we weren't able to gather tracking information for your package. <carrier> says <carrier_status_description>

        if(trackingData.status_code === ShipEngine.Carrier.TRACKING_STATUS_CODES.EXCEPTION){
            statement = 'Sorry, an exception occured while trying to gather tracking information. Please try again later.'; 
        }
        else if(trackingData.status_code === ShipEngine.Carrier.TRACKING_STATUS_CODES.UNKNOWN) {
            statement = `Sorry, we weren't able to gather tracking information for your package. ${carrier} says ${trackingData.carrier_status_description}.`; 
        }
        else {
            // Normal tracking circumstances; 
            let mostRecentTrackingEvent = trackingData.events[0];
            let jsDate = new Date(mostRecentTrackingEvent.occurred_at); 

            let date = `${WEEK_DAYS[jsDate.getDay()]}, ${MONTHS[jsDate.getMonth()]} ${jsDate.getDate()}`; 
            let time = `${(jsDate.getHours()+1)%12}:${jsDate.getMinutes()} ${jsDate.getHours() < 12 ? 'am': 'pm'}`; 
            
            let location = `${mostRecentTrackingEvent.city_locality}, ${mostRecentTrackingEvent.state_province}, ${mostRecentTrackingEvent.postal_code}`;  
             
            let action;
            if(trackingData.status_code === ShipEngine.Carrier.TRACKING_STATUS_CODES.ACCEPTED) action = 'has been accepted'; 
            else if(trackingData.status_code === ShipEngine.Carrier.TRACKING_STATUS_CODES.IN_TRANSIT) action = 'is in transit';  
            else action = 'was delivered'; // DELIEVERED

            statement = `As of ${date} at ${time}, ${carrier} said your package ${action} in ${location}`
        }

        return statement; 
    };

    // c. The function that tracks a package
    function trackPackage (app) {
        let number = app.getArgument(NUMBER_ARGUMENT);
        let originalCarrier = app.getArgument(CARRIER_ARGUMENT);
        let carrier = ShipEngine.Carrier.formatTrackingCarrier(originalCarrier);

        if(!carrier) {
            app.tell(`Sorry, but we do not currently provide tracking information for ${originalCarrier}`)
        }
        else {
            var nonHomophoneFound = false; 

            number = number.split(' ').map((char) => {
                // TODO work through homophones in the number!!
                return char; 
            }).join(''); 

            if(nonHomophoneFound) {
                // TODO reprompt for tracking number
                app.tell("Sorry, I didn't understand your tracking number. Please try again"); 
            }
            else {
                engine.trackPackage(carrier, number).then((data) =>{
                    console.log('ShipEngine Response: ' + JSON.stringify(data));

                    // use original carrier for pronunciation
                    app.tell(buildTrackingStatement(originalCarrier, data)); 
                }).catch((err) => {
                    console.log('error', err); 
                });
            }
        }
    }
  // d. build an action map, which maps intent names to functions
    let actionMap = new Map();
    actionMap.set(TRACK_ACTION, trackPackage);

    app.handleRequest(actionMap);
});