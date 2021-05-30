var aws = require('aws-sdk');
var http = require('http');
var ses = new aws.SES();
var ssm = new aws.SSM();
var cognitoidentityserviceprovider = new aws.CognitoIdentityServiceProvider();
var envPath = process.env.ssm_store;
var environment = {};

exports.handler = (event, context, callback) => {
    const surgeonId = event.surgeonId;
    const unlinkFrom = event.unlinkFrom;
    console.log('-----unlinkFrom---------', unlinkFrom);
    var envReq = getParameterFromSystemManager(envPath);
    envReq.then( (env) => {
        environment = env;
        console.log('--environment--', environment);
        getLinkedAccounts(surgeonId, (err, res) => {
            if (err) {
                console.error(err);
            } else {
                if(res.length > 0) {
                    let linkedAndPendingList = [];
                    let notificationDetails = [];
                    console.log(`----res--${JSON.stringify(res)}`);
                    linkedAndPendingList = res.filter((item) => item.subscriptionStatus === 'Activated' && (item.requestStatus !== 'Rejected' && item.requestStatus !== 'Unlinked'));
                    console.log(`---linkedAndPendingList--${JSON.stringify(linkedAndPendingList)}`);
                    linkedAndPendingList.forEach((item) => {
                        let userObj = {};
                        userObj['linkType'] = item.linkType;
                        userObj['requestStatus'] = item.requestStatus;
                        if (item.requestorId === surgeonId) {
                            userObj['recipientUserId'] = item.requesteeId;
                            userObj['recipientFullName'] = item.requesteeName;
                            userObj['recipientEmailid'] = item.requesteeEmailid;
                            userObj['senderPreferredId'] = item.requestorPreferredId;
                            userObj['senderFullName'] = item.requestorName;
                        } else {
                            userObj['recipientUserId'] = item.requestorId;
                            userObj['recipientFullName'] = item.requestorName;
                            userObj['recipientEmailid'] = item.requestorEmailid;
                            userObj['senderPreferredId'] = item.requesteePreferredId;
                            userObj['senderFullName'] = item.requesteeName;
                        }
                        notificationDetails.push(userObj);
                    });
                    console.log(`--notificationDetails---${JSON.stringify(notificationDetails)}`);
                    notificationDetails.forEach( async (userDetails) => {
                        let allowNotification = await getUserNotificationPreference(userDetails.recipientUserId);
                        if (allowNotification) {
                            let surgeonLang = await getUserLanguage(userDetails.recipientUserId);
                            let ssmPath = '/unlinkNotify/' + surgeonLang + '/';
                            console.log(`--ssmPath---${ssmPath}`);
                            let notifyParams = await getParameterFromSystemManager(ssmPath) || {};
                            let linkStatus = userDetails.requestStatus ? userDetails.requestStatus.toLowerCase() : '';
                            let emailSubjectParam = linkStatus === 'pending' ? notifyParams['email_subject_forPending'] : notifyParams['email_subject_forLinked'];
                            let emailMessageParam = linkStatus === 'pending' ? notifyParams['email_message_forPending'] : notifyParams['email_message_forLinked'];
                            let cloudMessageParam = linkStatus === 'pending' ? notifyParams['cloud_message_forPending'] : notifyParams['cloud_message_forLinked'];
                            let placeholderObj = {
                                placehold_recipientName: userDetails.recipientFullName,
                                placehold_senderName: userDetails.senderFullName,
                                placehold_senderUsername: userDetails.senderPreferredId,
                                placehold_linkType: userDetails.linkType,
                                placehold_unlinkReason : unlinkFrom === 'termination' ? notifyParams['reason_termination'] : notifyParams['reason_expiry']
                            };
                            let notifyEmailMessage = '',
                                notifyCloudMessage = '';
                            notifyEmailMessage = replacePlacholders(emailMessageParam, placeholderObj);
                            console.log(`--notifyEmailMessage---${JSON.stringify(notifyEmailMessage)}`);
                            notifyCloudMessage = replacePlacholders(cloudMessageParam, placeholderObj);
                            console.log(`--notifyCloudMessage---${JSON.stringify(notifyCloudMessage)}`);
                            
                            sendEmail(userDetails['recipientEmailid'], notifyParams['email_body_template'], emailSubjectParam, notifyEmailMessage);
                            saveCloudNotification(userDetails['recipientUserId'], notifyCloudMessage);
                        }
                    });
                }
            }
        });
        
    }).catch((err) => {
        console.log('GetSSMParam-error', err);
    });
};

/* Function to call linked accounts GET API */
function getLinkedAccounts(surgeonId, callback) {
    const options = {
        host: environment['API_host'],
        port: environment['API_port'],
        path: '/surgeon/linkAccount',
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'authorization': 'Random Token',
            'lambda': '#1234lambd@_tr1gger4321#',
            'surgeonid': surgeonId
        }
    };
    console.log(`----options-------${JSON.stringify(options)}`);
    const req = http.request(options, (res) => {
        if (res.statusCode != 200) {
            console.log(`Error getting list status code:  ${res.statusCode}`);
            // let res = JSON.stringify(res);
            return callback(res, null);
        } else {
            var str = '';
            res.on('data', function (chunk) {
                str += chunk;
            });

            res.on('end', () => {
                var result = JSON.parse(str);
                return callback(null, result);
            });
        }
    });

    req.on('error', (e) => {
        console.log(`Error getting list :  ${e.message}`);
        let err = JSON.stringify(e);
        return callback(err, null);
    });
    req.end();
}

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
        console.log(`-pref---options-------${JSON.stringify(options)}`);
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
                    console.log('-pref--result----', result);
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
            console.log(`Error getting pref :  ${e.message}`);
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

function saveCloudNotification(userId, notificationtext) {
    var data = JSON.stringify({
        'notificationtype': "LinkAccount Unlink",
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