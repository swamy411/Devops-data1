var aws = require('aws-sdk');
var http = require('http');
var lambda = new aws.Lambda({
    region: 'us-east-1'
});
var ses = new aws.SES();
var sns = new aws.SNS();
var ssm = new aws.SSM();
var cognitoidentityserviceprovider = new aws.CognitoIdentityServiceProvider();
var envPath = process.env.ssm_store;
var environment = {};


exports.handler = (event, context, callback) => {
  var envReq = getParameterFromSystemManager(envPath);
  envReq.then( async (env) => {
    environment = env;
    let expiryVariableSSM = await getParameterFromSystemManager('/expiryNotify/variable/') || {};
    console.log('--expiryVariableSSM--',expiryVariableSSM);
    var configuredDuedate = (isNaN(expiryVariableSSM.expiryDueDays)
      || expiryVariableSSM.expiryDueDays === ' ') ? 3 : expiryVariableSSM.expiryDueDays;
    var configuredFrequency = (isNaN(expiryVariableSSM.notificationFrequency)
      || expiryVariableSSM.notificationFrequency === ' ') ? 1 : expiryVariableSSM.notificationFrequency;
    var configuredRecipients = expiryVariableSSM.additionalRecipients ? expiryVariableSSM.additionalRecipients.split(';') : [];
    const options = {
      host: environment['API_host'],
      port: environment['API_port'],
      path: `/subscription/expiryDue?expiryDays=${configuredDuedate}`,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Actor': 'From SubscriptionExpiryEmailSMSNotification function',
        'lambda': '#1234lambd@_tr1gger4321#'

      }
    };
    console.log('-/subscription/expiryDue-options--',options);

    const req = http.request(options, (res) => {

      console.log('Web service called and response code--', res.statusCode);

      if (res.statusCode != 200) {
        console.log('Error from web service' + res.statusCode);
      } else {
        var str = '';
        res.on('data', function (chunk) {
          str += chunk;
        });

        res.on('end', async () => {
          var notifications = JSON.parse(str);
          console.log('-----notifications----', notifications);
          let otherRecipientsParam;
          if(notifications.length) { // considering that the other recipient's preferred lang as 'en'
            otherRecipientsParam = await getParameterFromSystemManager('/expiryNotify/en/') || {};
          }
          for (let j = 0; j < notifications.length; j++) {
            var notification = notifications[j];
            let allowSendNotify = false;
            let userExpiryDayCount = notification['expiryDayCount'] ? Number(notification['expiryDayCount']) : 0;
            if (!isNaN(userExpiryDayCount)) {
              if (userExpiryDayCount % configuredFrequency === configuredDuedate % configuredFrequency ||
                  userExpiryDayCount < configuredFrequency ||
                  userExpiryDayCount === 0 && configuredFrequency > 0) {
                allowSendNotify = true;
              }
            }
            if(allowSendNotify) {
              let surgeonMessage = '',
                  adminMessage = '',
                  ssmPath;
              let placeholderObj = {
                placehold_surgeonName: notification['surgeonName'],
                placehold_adminName: notification['adminName'],
                placehold_daysLeft: userExpiryDayCount,
                placehold_licenseId: notification['licenseId']
              };

              let surgeonLang = await getUserLanguage(notification['surgeonid']);
              ssmPath = '/expiryNotify/' + surgeonLang + '/';
              let surgeonParams = await getParameterFromSystemManager(ssmPath) || {};
              surgeonMessage = userExpiryDayCount ? surgeonParams['message_toSurgeon_beforeExpiry']:
              surgeonParams['message_toSurgeon_afterExpiry'];
              surgeonMessage = replacePlacholders(surgeonMessage, placeholderObj);
              let adminParams = {};
              if (notification['adminid']) {
                let adminLang  = await getUserLanguage(notification['adminid']);
                ssmPath = '/expiryNotify/' + adminLang + '/';
                adminParams = await getParameterFromSystemManager(ssmPath) || {};
                adminMessage = userExpiryDayCount ? adminParams['message_toAdmin_beforeExpiry'] :
                adminParams['message_toAdmin_afterExpiry'];
                adminMessage = replacePlacholders(adminMessage, placeholderObj);
              }

              if (notification['notificationstatus'] == true || notification['notificationstatus'] == 'true') {
                console.log('notification status In Surgeon', notification['notificationstatus']);
                sendEmail(notification['surgeonEmail'], surgeonParams['email_body_template'], surgeonParams['email_subject'], surgeonMessage);
                sendSMS(notification['surgeonPhone'], surgeonMessage);
                saveNotification(notification['surgeonid'], surgeonMessage);
                if (notification['adminEmail']) {
                  sendEmail(notification['adminEmail'], adminParams['email_body_template'], adminParams['email_subject'], adminMessage);
                  sendSMS(notification['adminPhone'], adminMessage);
                  saveNotification(notification['adminid'], adminMessage);
                }
              } else {
                console.log('notification status In Admin', notification['notificationstatus']);
                if (notification['adminEmail']) {
                  sendEmail(notification['adminEmail'], adminParams['email_body_template'], adminParams['email_subject'], adminMessage);
                  sendSMS(notification['adminPhone'], adminMessage);
                  saveNotification(notification['adminid'], adminMessage);
                }
              }
              let otherRecipientsMessage = userExpiryDayCount ? otherRecipientsParam['message_toAdditionalRecipients_beforeExpiry'] :
              otherRecipientsParam['message_toAdditionalRecipients_afterExpiry'];
              otherRecipientsMessage = replacePlacholders(otherRecipientsMessage, placeholderObj);
              configuredRecipients.forEach((eachId) => {
                if(eachId) {
                  console.log('----to--additionalRecipient-', eachId);
                  sendEmail(eachId, otherRecipientsParam['email_body_template'], otherRecipientsParam['email_subject'], otherRecipientsMessage);
                }
              });
              // To send unlink notification
              if (!userExpiryDayCount) {
                await sendUnlinkNotification(notification['surgeonid']);
              }
            }
          }

        });

      }

    });

    req.on('error', (e) => {
      console.log('Error Message: ' + e.message);
    });

    console.log('End Data call');
    req.end();

  }).catch((err) => {
    console.log('GetSSMParam-error', err);
  });
};

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

function replacePlacholders(string, placeholderObj) {
  let str = string;
  let reg = new RegExp(Object.keys(placeholderObj).join("|"),"gi");
  str = str.replace(reg, function(matched){
    return placeholderObj[matched];
  });
  return str;
}

function sendEmail(to, template, subject, message) {
  console.log("sending mail to - " + "to");
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

function sendSMS(phone, message) {
  console.log("sending SMS  to - " + phone);
  var params = {
    Message: message,
    PhoneNumber: phone
  };

  sns.publish(params, function (err, data) {
    if (err) {
      console.log(err, err.stack); // an error occurred  
      console.log("=== SMS NOT SENT===");
    } else {
      console.log(data);           // successful response
      console.log("=== SMS SENT===");
    }
  });
}

function saveNotification(userId, notificationtext) {
  var data = JSON.stringify({

    'notificationtype': "Subscription Expired",
    'notificationtext': notificationtext

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

function generateHTMLEmail(template, message) {
  var emailHtml = template;
  let placeholderObj = {
    placehold_logopath: environment['url_intelliologo'],
    placehold_message: message
  };
  emailHtml = replacePlacholders(emailHtml, placeholderObj);    
  return emailHtml;
}

async function sendUnlinkNotification(surgeonUserId) {
  let lambdaPayload = {
      surgeonId : surgeonUserId,
      unlinkFrom : 'expiry'
  };
  return new Promise((resolve, reject) => {
      lambda.invoke({
          FunctionName: environment['envprefix']+'_UnlinkNotifyOtherUsers',
          Payload: JSON.stringify(lambdaPayload)
      }, function (err, data) {
          console.log('UnlinkNotifyOtherUsers Function call');
          if (err) {
              console.log('error in UnlinkNotifyOtherUsers : ' + err);
              reject(false);
          } else if (data) {
              console.log("UnlinkNotifyOtherUsers success");
              resolve(true);
          }
      });
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