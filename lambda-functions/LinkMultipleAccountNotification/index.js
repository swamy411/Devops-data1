var aws = require('aws-sdk');
var http = require('http');
var ses = new aws.SES();
var ssm = new aws.SSM();
var cognitoidentityserviceprovider = new aws.CognitoIdentityServiceProvider();
var envPath = process.env.ssm_store;
var environment = {};

exports.handler = (event, context, callback) => {
    const notifyDetails = event;
    console.log('--notifyDetails--', notifyDetails);
    var envReq = getParameterFromSystemManager(envPath);
    envReq.then( async (env) => {
        environment = env;
        console.log('--environment--', environment);
        let ssmPath = '',
            emailSubject = '',
            mailMessage = '',
            cloudMessage = '',
            cloudNotifyType = '',
            toUserName = notifyDetails.toUserId,
            toEmailId = notifyDetails.toEmailId;
        const actionType = notifyDetails.actionType;

        let allowNotification = await getUserNotificationPreference(toUserName);
            if (allowNotification) {
                let surgeonLang = await getUserLanguage(toUserName);

                if (actionType === 'Request') {
                    cloudNotifyType = 'LinkAccount Request';
                    ssmPath = '/linkMultipleAccount/request/' + surgeonLang + '/';
                } else if (actionType === 'Cancel') {
                    cloudNotifyType = 'LinkAccount Cancel';
                    ssmPath = '/linkMultipleAccount/cancel/' + surgeonLang + '/';
                } else if (actionType === 'Reject') {
                    cloudNotifyType = 'LinkAccount Reject';
                    ssmPath = '/linkMultipleAccount/reject/' + surgeonLang + '/';
                } else if (actionType === 'Approve') {
                    cloudNotifyType = 'LinkAccount Approve';
                    ssmPath = '/linkMultipleAccount/approve/' + surgeonLang + '/';
                } else if (actionType === 'Unlink') {
                    cloudNotifyType = 'LinkAccount Unlink';
                    ssmPath = '/linkMultipleAccount/unlink/' + surgeonLang + '/';
                }
                console.log(`--ssmPath---${ssmPath}`);

                let notifyParams = await getParameterFromSystemManager(ssmPath) || {};

                let placeholderObj = {
                    placehold_recipientName: notifyDetails.toUserFullname,
                    placehold_senderName: notifyDetails.fromUserFullname,
                    placehold_senderUsername: notifyDetails.fromUserPreferredId,
                    placehold_linkType: notifyDetails.linkType,
                    placehold_actionNotes: notifyDetails.actionNotes
                };
                emailSubject = notifyParams['email_subject'];
                mailMessage =  notifyParams['email_message'];
                mailMessage = replacePlacholders(mailMessage, placeholderObj);
                console.log(`--mailMessage---${JSON.stringify(mailMessage)}`);
                cloudMessage = notifyParams['cloud_message'];
                cloudMessage = replacePlacholders(cloudMessage, placeholderObj);
                console.log(`--cloudMessage---${JSON.stringify(cloudMessage)}`);
                
                sendEmail(toEmailId, notifyParams['email_body_template'], emailSubject, mailMessage);
                saveCloudNotification(toUserName, cloudMessage, cloudNotifyType);
            }

    }).catch((err) => {
        console.log('GetSSMParam-error', err);
    });
};

/* Function to call user notification preference API */
function getUserNotificationPreference(surgeonId) {
    return new Promise((resolve, reject) => {
        const options = {
            host: environment['API_host'],
            port: environment['API_port'],
            path: '/user/profile/preferences',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'authorization': 'Random Token',
                'lambda': '#1234lambd@_tr1gger4321#',
                'surgeonid': surgeonId
            }
        };
        const req = http.request(options, (res) => {
            if (res.statusCode != 200) {
                console.log(`Error getting pref status code:  ${res.statusCode}`);
                resolve(null);
            } else {
                var str = '';
                res.on('data', function (chunk) {
                    str += chunk;
                });
                res.on('end', () => {
                    let result = JSON.parse(str);
                    console.log('Getpref--result-', result);
                    if (Object.keys(result).length) {
                        if (result.notifications === true) {
                        resolve(true);
                        } else {
                        resolve(false);
                        }
                    } else {
                        resolve(null);
                    }
                });
            }
        });
        req.on('error', (e) => {
            console.log(`Error getpref :  ${e.message}`);
            resolve(null);
        });
        req.end();
    });
}

/* Function to call user preferred language cognito API */
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

function sendEmail(to, template, subject, message) {
    console.log("sending mail to - " + to);
    var eParams = {
        Destination: {
            ToAddresses: [to]
        },
        Message: {
            Body: {
                Html: {
                    Charset: "UTF-8",
                    Data: generateHTMLEmail(template, message)
                }
            },
            Subject: {
                Charset: "UTF-8",
                Data: subject
            }
        },
        // Replace source_email with your SES validated email address
        Source: "Smith&Nephew" + environment['id_emailsource']
    };

    ses.sendEmail(eParams, function (err, data) {
        if (err) {
            console.log(err);
            console.log("===EMAIL NOT SENT===");
        } else {
            console.log(data);
            console.log("===EMAIL SENT===");
        }
    });
    console.log("EMAIL CODE END");
}

function generateHTMLEmail(template, message) {
    var emailHtml = template;
    let placeholderObj = {
        placehold_logopath: environment['url_intelliologo'],
        placehold_message: message
    };
    emailHtml = replacePlacholders(emailHtml, placeholderObj);    
    return emailHtml;
}

function replacePlacholders(string, placeholderObj) {
    let str = string;
    let reg = new RegExp(Object.keys(placeholderObj).join("|"),"gi");
    str = str.replace(reg, function(matched){
      return placeholderObj[matched];
    });
    return str;
}

function saveCloudNotification(userId, notificationtext, notifyType) {
    var data = JSON.stringify({
        'notificationtype': notifyType,
        'notificationtext': notificationtext,
        'displaytouser': userId
    });
    var headers = {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'lambda': '#1234lambd@_tr1gger4321#',
        'Authorization': 'Random Token',
        'surgeonid': userId
    };
    var options = {
        host: environment['API_host'],
        path: '/notification',
        port: environment['API_port'],
        method: 'POST',
        headers: headers
    };
    // Set up the request
    var post_req = http.request(options, function (res) {
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            console.log('Response: ' + chunk);
        });
        res.on('error', function (e) {
            console.log("Got error: " + e.message);
        });

    });
    var jsonToSend = JSON.parse(data);
    // post the data
    post_req.write(data);
    post_req.end();
}

/* Function to get SSM parameters */
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