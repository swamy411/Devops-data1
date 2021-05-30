var aws = require('aws-sdk');
var http = require('http');
var ses = new aws.SES();
var sns = new aws.SNS();
var ssm = new aws.SSM();
var cognitoidentityserviceprovider = new aws.CognitoIdentityServiceProvider();
var envPath = process.env.ssm_store;
var environment = {};
var emailParams = {};

exports.handler = (event, context, callback) => {
    var envReq = getParameterFromSystemManager(envPath);
    envReq.then((env) => {
        environment = env;
        aws.config.update({region: 'us-east-1'});
        console.log(event);
        if(event.email) {
            sendEmail(event);
        }
        if(event.mobile) {
            sendSMS(event);
        }
    }).catch((err) => {
        console.log('GetSSMParam-error', err);
    });
};

async function sendEmail(emailDetails) {
    console.log(emailDetails);
    let lang  = await getUserLanguage(emailDetails.surgeonId);
    let ssmPath = '/dataToSurgeon/' + lang + '/';
    emailParams = await getParameterFromSystemManager(ssmPath) || {};
    var subject = emailDetails.subject;
    var eParams = {
        Destination: {
            ToAddresses: [emailDetails.email]
        },
        Message: {
            Body: {
                Html: {
                 Charset: "UTF-8", 
                 Data: generateHTMLEmail(emailDetails)
                }
            },
            Subject: {
                Data: subject
            }
        },

        // Replace source_email with your SES validated email address
        Source: environment['id_emailsource']
    };

    ses.sendEmail(eParams, function(err, data){
        if (err) {
            console.log(err);
        } else {
            console.log("===EMAIL SENT===");
        }
    
    });
    console.log("EMAIL CODE END");
}

function getUserLanguage(username) {
    const params = {
        UserPoolId: environment['id_userpool'],
        Username: username
    };
    return new Promise((resolve, reject) => {
        cognitoidentityserviceprovider.adminGetUser(params, (errDetail, dataDetail) => {
            if (errDetail) {
                console.log('Error getUser', errDetail);
                resolve('en');
            } else {
                let attributes = dataDetail.UserAttributes;
                let langAttribute = attributes.filter((attribute) => {
                    return attribute.Name === 'custom:preferred_lang';
                });
                let preferredLang = langAttribute[0] ? langAttribute[0]['Value'] : 'en';
                resolve(preferredLang);
            }
        });
    });
}

function generateHTMLEmail(emailDetails) {
    var emailHtml = emailParams['email_body_template'];
    var placeholderObj = {
        placehold_logopath: environment['url_intelliologo'],
        placehold_message1: emailDetails.textMessage1,
        placehold_message2: emailDetails.textMessage2,
        placehold_link: emailDetails.sharableLink
    };
    let reg = new RegExp(Object.keys(placeholderObj).join("|"),"gi");
    emailHtml = emailHtml.replace(reg, function(matched){
      return placeholderObj[matched];
    });
    return emailHtml;
} 

function sendSMS(messageDetails){
    var params = {
      Message: messageDetails.textMessage1 + "\n " + messageDetails.sharableLink + "\n " + messageDetails.textMessage2, /* required */
      PhoneNumber: messageDetails.mobile 
      };
    
    sns.publish(params, function(err, data) {
      if (err){
        console.log(err, err.stack); // an error occurred  
        console.log("=== SMS NOT SENT===");
      }else{   
         console.log(data);           // successful response
         console.log("=== SMS SENT===");
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
                resolve(env);
            }
        });
    });
}