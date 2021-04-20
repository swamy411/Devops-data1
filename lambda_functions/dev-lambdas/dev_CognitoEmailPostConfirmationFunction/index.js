var aws = require('aws-sdk');
var http = require('http');
var ses = new aws.SES();
var lambda = new aws.Lambda({
    region: 'us-east-1'
});
var ssm = new aws.SSM();
var envPath = process.env.ssm_store;
var environment = {};
var emailParams = {};
var cognitoidentityserviceprovider;
var previousRequestId = undefined;
var isMfa = false;
cognitoidentityserviceprovider = new aws.CognitoIdentityServiceProvider();
exports.handler = (event, context, callback) => {
    var envReq = getParameterFromSystemManager(envPath);
    envReq.then((env) => {
        environment = env;
        console.log('environment-----', environment);
        if (previousRequestId != context.awsRequestId) {
            previousRequestId = context.awsRequestId;
        }
        
        console.log(context);
        console.log('Previous request ', previousRequestId);
        console.log('current request ', context.awsRequestId);
        // TODO implement
        console.log('Handling confirmation email to', event);
        console.log(event.request.userAttributes);
        // callback(null, 'Registration Failed');
        if (event.triggerSource === "PostConfirmation_ConfirmSignUp") {
            

            if (event.request.userAttributes.email) {
                mapUser(event, context, callback);
            } else {
                // Nothing to do, the user's email ID is unknown
                callback(Error('errorregistration'));
                // context.done(null, 'Error');
            }
        } else {
            callback(null, event);
        }
    }).catch((err) => {
        console.log('GetSSMParam-error', err);
    });
};

function mapUser(event, context, callback) {
    console.log('event.request.userAttributes custom:MFA', event.request.userAttributes['custom:MFA']);
    //'custom:MFA': 'true',
    if (event.request.userAttributes.hasOwnProperty('custom:MFA') && event.request.userAttributes['custom:MFA'] === 'true') {
        isMfa = true;
    }
    var headers = {
        'Content-Type': 'application/json',
        'lambda': '#1234lambd@_tr1gger4321#'
    };

    var options = {
        protocol: 'http:',
        host: environment['API_host'],
        //host: '10.182.0.114',
        port: environment['API_port'],
        path: '/user/registration',
        method: 'POST',
        headers: headers
    };


    var body = JSON.stringify({
        "subscriptionCode": event.request.userAttributes['custom:license_code'],
        "userName": event.userName,
        "firstName": event.request.userAttributes['given_name'],
        "lastName": event.request.userAttributes['family_name'],
        "email": event.request.userAttributes['email'],
        "phoneNo": event.request.userAttributes['phone_number'],
        "userRole": event.request.userAttributes['custom:group_name']
    });
    console.log("## Body Json");
    console.log(body);

    console.log(options);

    const req = http.request(options, (res) => {
        console.log(res.statusCode);
        var str = '';
        res.on('data', (chunk) => {
            str += chunk;
        });

        res.on('end', () => {
            console.log("response from service" + str + JSON.parse(str));
            console.log('###response starts ####');
            console.log(str);
            console.log('### Res ends ###');
            console.log('SuccessCall Message: ' + res);
            if (res.statusCode == 201) {
                console.log('Successfull Registration');
                addUserToGroup(event, context, callback);
                sendEmail(event, event.request.userAttributes.email, true, '', (status) => {
                    callback(null, event);
                    // context.done(null, 'success');
                });
                //   resolve('pass');
            } else {
                console.log('Error Registration' + res.statusCode);
                console.log(JSON.parse(str));
                var response = JSON.parse(str);
                var errMsg = '';                
                 var params = {
                        UserPoolId: event.userPoolId,
                        /* required */
                        Username: event.userName /* required */
                    };
                if (response.hasOwnProperty('errorCode') && response.errorCode == 1057) {
                    errMsg = 'license';
                   
                    cognitoidentityserviceprovider.adminDeleteUser(params, (err, data) => {
                        if (err) console.log(err, err.stack); // an error occurred
                        else console.log(data); // successful response
                        callback(Error('samelicense'));
                    });
                    
                    
                } else {
                    errMsg = 'internal';
                    callback(Error('errorregistration'));
                }
                
                //   resolve(JSON.parse(str));
                // sendEmail(event, event.request.userAttributes.email, false, errMsg, (status) => {
                //     console.log(res.statusCode, ' Mapping failed ', status);
                //     callback(Error('errorregistration'));
                //     // context.done(null, 'failure');
                // });


            }
        });

        //resolve('SuccessCall');
    });

    req.on('error', (e) => {
        
        // sendEmail(event, event.request.userAttributes.email, false, 'internal', (status) => {
        //    console.log('Error Message: ' + status);
        //     callback(Error('errorregistration'));
        //     // context.done(null, 'failure');
        // });

        var params = {
            UserPoolId: event.userPoolId,
            /* required */
            Username: event.userName /* required */
        };
        cognitoidentityserviceprovider.adminDeleteUser(params, (err, data) => {
            if (err) console.log(err, err.stack); // an error occurred
            else console.log(data); // successful response
        });
        callback(Error('errorregistration'));
        //   reject(e.message);
    });

    console.log('End Data call');
    req.write(body);
    req.end();
}

async function sendEmail(event, to, success, message, completedCallback) {
    var subject = '',
        errMsg = '';
    let lang  = event.request.userAttributes['custom:preferred_lang'] || 'en';
    let ssmPath = '/registration/' + lang + '/';
    emailParams = await getParameterFromSystemManager(ssmPath) || {};
    console.log('emailParams-----', emailParams);
    if (success) {
        subject = emailParams['email_subject_success'];
    } else {
        var params = {
            UserPoolId: event.userPoolId,
            /* required */
            Username: event.userName /* required */
        };
        cognitoidentityserviceprovider.adminDeleteUser(params, (err, data) => {
            if (err) console.log(err, err.stack); // an error occurred
            else console.log(data); // successful response
        });
        subject = emailParams['email_subject_failure'];
    }

    if (!!message && message === 'license') {
        errMsg = emailParams['email_errormessage_license'];
    } else {
        errMsg = emailParams['email_errormessage_server'];
    }
    console.log(to);
    var eParams = {
        Destination: {
            ToAddresses: [to]
        },
        Message: {
            Body: {
                // Text: {
                //     Data: body
                // },
                Html: {
                    Charset: "UTF-8",
                    Data: generateHTMLEmail(event.userName, event.request.userAttributes.email, event.request.userAttributes.phone_number, success, errMsg)
                }
            },
            Subject: {
                Data: subject
            }
        },

        // Replace source_email with your SES validated email address
        Source: "Smith&Nephew " + environment['id_emailsource']
    };

    ses.sendEmail(eParams, (err, data) => {
        if (err) {
            console.log(err);
        } else {
            console.log("===EMAIL SENT===");
        }
        completedCallback('Email sent');
    });
    console.log("EMAIL CODE END");
}

function generateHTMLEmail(username, email, phnno, success, errMsg) {
    var content = ``,
        mfaMessage = '';
    
    mfaMessage = isMfa ? emailParams['email_message_mfa'] : '';
    content = success ? emailParams['email_message_success'] : emailParams['email_message_failure'] ;
    var placeholderObj = {
        placehold_username: username,
        placehold_mfaMessage: mfaMessage,
        placehold_email: email,
        placehold_phone: phnno,
        placehold_errorMessage: errMsg
    };
    content = replacePlacholders(content, placeholderObj);
    console.log('-----content-------', content);
    var emailHtml = emailParams['email_body_template'];
    placeholderObj = {
        placehold_message: content,
        placehold_logopath: environment['url_intelliologo']
    };
    emailHtml = replacePlacholders(emailHtml, placeholderObj);
    console.log('-----emailHtml-------', emailHtml);
    
    return emailHtml;
}

function replacePlacholders(string, placeholderObj) {
    let str = string;
    let reg = new RegExp(Object.keys(placeholderObj).join("|"),"gi");
    str = str.replace(reg, function(matched){
      return placeholderObj[matched];
    });
    console.log('---done replace--', str);
    return str;
}

function addUserToGroup(event, context, callback) {

    console.log("Group name " + event.request.userAttributes["custom:group_name"]);
    var params = {
        //GroupName: 'lensuser', //The name of the group in you cognito user pool that you want to add the user to
        GroupName: event.request.userAttributes["custom:group_name"], //The name of the group in you cognito user pool that you want to add the user to
        UserPoolId: event.userPoolId,
        Username: event.userName

    };
    //some minimal checks to make sure the user was properly confirmed
    if (!(event.request.userAttributes["cognito:user_status"] === "CONFIRMED" && event.request.userAttributes.email_verified === "true"))
        callback("User was not properly confirmed and/or email not verified");
    cognitoidentityserviceprovider.adminAddUserToGroup(params, (err, data) => {
        if (err) {
            // callback(err); // an error occurred
            console.log('###add user group error ', err);
        } else {
            console.log('###add user group success ', data);
        }
        // callback(null, event); // successful response
    });

    var paramsPreferred = {
        //GroupName: 'lensuser', //The name of the group in you cognito user pool that you want to add the user to
        UserAttributes: [{
            Name: 'preferred_username',
            Value: event.userName
        }], //The name of the group in you cognito user pool that you want to add the user to
        UserPoolId: event.userPoolId,
        Username: event.userName

    };

    cognitoidentityserviceprovider.adminUpdateUserAttributes(paramsPreferred, (errUpdate, dataUpdate) => {
        if (errUpdate) {
            console.log('update user atribute ', errUpdate);
            // callback(err, null);
        } else {
            console.log('update attribute  success ', dataUpdate);
            // callback(null, data);
        }
    });
}

function getParameterFromSystemManager(ssmpath) {
    return new Promise((resolve, reject) => {
        var params = {
            Path: ssmpath,
            /* required */
            WithDecryption: false,
            Recursive: true
        };
        ssm.getParametersByPath(params, function (err, data) {
            if (err) {// an error occurred
                reject(false);
            }
            else {// successful response
                let dataEnv = data.Parameters ? data.Parameters : [];
                let env = {};
                dataEnv.forEach((eachItem) => {
                    let key = eachItem.Name;
                    key = key.replace(ssmpath , '');
                    key = key.replace('/', '_');
                    env[key] = eachItem.Value;
                });
                console.log('env ', env);
                resolve(env);
            }
        });
    });
}
