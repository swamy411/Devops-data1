exports.handler = (event, context, callback) => {
    console.log(event, context, callback);
    console.log(event.triggerSource);
    if (event.request.userAttributes.hasOwnProperty('custom:group_name')) {
        // if(event.request.userAttributes['custom:group_name'] == 'admin') {
        if(event.request.userAttributes['custom:group_name'] != 'surgeon' && event.request.userAttributes['custom:group_name'] != 'hospital_admin') {
            callback(Error('errorregistration'));
        }
    }
    
    callback(null, event);
    // if (event.request.userAttributes.hasOwnProperty("email")) {
    //     event.response.autoVerifyEmail = true;
    // }

    // // Set the phone number as verified if it is in the request
    // if (event.request.userAttributes.hasOwnProperty("phone_number")) {
    //     event.response.autoVerifyPhone = true;
    // }

    // Return to Amazon Cognito
    
    // TODO implement
    // const response = {
    //     statusCode: 200,
    //     body: JSON.stringify('Hello from Lambda!'),
    // };
    // return response;
};
