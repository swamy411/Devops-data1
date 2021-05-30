var AWS = require('aws-sdk');
var userNames, resposeUsername;
var response;
var params;
var ses = new AWS.SES();
var sns = new AWS.SNS();
var ssm = new AWS.SSM();
var envPath = process.env.ssm_store;
var environment = {};
var emailSmsParams = {};

exports.handler = function(event, context, callback) {
    var envReq = getParameterFromSystemManager(envPath);
    envReq.then((env) => {
        environment = env;
        userNames = [];
        resposeUsername = [];
        console.log('Unauth_Cognito_ListUsers.handler called');
        
        var cognitoidentityserviceprovider = new AWS.CognitoIdentityServiceProvider({
            region: AWS.config.region
        });
        
        var body = event["body"];
        console.log('body: ' + body);
        var requestJSON = JSON.parse(body);
        var email = requestJSON["email"];
        var phone = requestJSON["phone"];
        console.log('email: ' + email);
        console.log('phone: ' + phone);
        if(email!=undefined){
        params = {
                    UserPoolId: environment['id_userpool'],
                    //AttributesToGet: ['preferred_username'],
                    Filter: 'email = ' + "'" + email + "'"
        };
        }else if(phone!=undefined){
        params = {
                    UserPoolId: environment['id_userpool'],
                    //AttributesToGet: ['preferred_username'],
                    Filter: 'phone_number = ' + "'" + phone + "'"
        };  
            
        }
        cognitoidentityserviceprovider.listUsers(params, function(err, data) {
        if (err) {
            console.log('Error: ' + err);
            response = {
                statusCode: 500,
                body: JSON.stringify('Internal Server Error'),
            };
            callback(null, response);    
        } else {
            console.log('Success!');
            var users = data['Users'];
            for(var i = 0; i < users.length; i++) {
                var userName = users[i]['Username'];
                console.log(userName);
                userNames[i] = userName;
                resposeUsername[i] = "";
            }
            response = {
                statusCode: 200,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "OPTIONS,POST",
                    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,access-control-allow-methods,access-control-allow-origin,x-forwarded-host"
                },
                body: JSON.stringify(resposeUsername),
            };
            
            if(email!=undefined && userNames.length > 0){
                console.log('email--',);
                sendEmail(email,userNames , function(status) {
                            callback(null, response);
                        });
                
            }
            else
            if(phone!= undefined && userNames.length > 0){
                console.log('phone--',);
                sendSms(phone,userNames , function(status) {
                            callback(null, response);
                        });
                
            } else {
                console.log('else ', response);
                callback(null, response);
            }
            
            // callback(null, response);
        }
      });  
    }).catch((err) => {
        console.log('GetSSMParam-error', err);
    });
};

async function sendEmail(email , userNames, completedCallback) {
    console.log(email);
    let lang  = 'en';
    let ssmPath = '/recoverUsername/' + lang + '/';
    emailSmsParams = await getParameterFromSystemManager(ssmPath) || {};
    var eParams = {
        Destination: {
            ToAddresses: [email]
        },
        Message: {
            Body: {
                // Text: {
                //     Data: body
                // },
                Html: {
                 Charset: "UTF-8", 
                 Data: generateHTMLEmail(userNames)
                }
            },
            Subject: {
                Data: emailSmsParams['email_subject']
            }
        },

        // Replace source_email with your SES validated email address
        Source: "Smith&Nephew" + environment['id_emailsource']
    };

    ses.sendEmail(eParams, function(err, data){
        if (err) {
            console.log(err);
        } else {
            console.log("===EMAIL SENT===");
        }
        completedCallback('Email sent');
    });
    console.log("EMAIL CODE END");
}

async function sendSms(phone, usernames, completedCallback){
     var SNS_TOPIC_ARN = "arn:aws:sns:us-east-1:491655376147:Recover-Username";
    
    let lang  = 'en';
    let ssmPath = '/recoverUsername/' + lang + '/';
    emailSmsParams = await getParameterFromSystemManager(ssmPath) || {};
    var smsMessage = emailSmsParams['sms_message'];
    var placeholderObj = {
        placehold_usernameList: usernames,
        placehold_phone: phone
    };
    let reg = new RegExp(Object.keys(placeholderObj).join("|"),"gi");
    smsMessage = smsMessage.replace(reg, function(matched){
      return placeholderObj[matched];
    });
    //subscribing a mobile number to a topic
    sns.subscribe({
        Protocol: 'sms',
        TopicArn: SNS_TOPIC_ARN,
        Endpoint: phone // type mobile number to whom you want to send a message.
    }, (error, data)=> {
        if (error) {
            console.log("error when subscribe", error);
        }
        console.log("subscribe data", data);
        console.log(usernames);
        var SubscriptionArn = data.SubscriptionArn;
        var params = {
            TargetArn: SNS_TOPIC_ARN,
            Message: smsMessage,
        };
        
        //publish a message.
        sns.publish(params, (err_publish, data)=> {
            if (err_publish) {
                console.log('Error sending a message', err_publish);
                completedCallback('SMS failed');
            } else {
                console.log('Sent message:', data.MessageId);
                completedCallback('SMS Sent');
            }
            var params = {
                SubscriptionArn: SubscriptionArn
            };
            
            //unsubscribing the topic
            sns.unsubscribe(params, function(err, data) {
                if (err) {
                    console.log("err when unsubscribe", err);
                }
            });
        });
   });
}

function generateHTMLEmail(email, usernames) {
    var emailHtml = emailSmsParams['email_body_template'];
    var placeholderObj = {
        placehold_logopath: environment['url_intelliologo'],
        placehold_usernameList: usernames,
        placehold_email: email
    };
    let reg = new RegExp(Object.keys(placeholderObj).join("|"),"gi");
    emailHtml = emailHtml.replace(reg, function(matched){
      return placeholderObj[matched];
    });
    return emailHtml;
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
                resolve(env);
            }
        });
    });
}