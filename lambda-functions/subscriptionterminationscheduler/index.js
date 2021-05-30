var aws = require('aws-sdk');
var fs = require('fs');
var http = require('http');
var ssm = new aws.SSM();
var envPath = process.env.ssm_store;
var cognitoidentityserviceprovider = new aws.CognitoIdentityServiceProvider();
var environment = {};
var s3 = new aws.S3();
var ses = new aws.SES();
const TERMINATION_INPROGRESS = 11;
const TERMINATED = 3;
var lensmediaBucket;
var procedureArchiveBucket;
var lambda = new aws.Lambda({
    region: 'us-east-1'
});
/*
1.GET API for Termination In progress users - Done
2.Checking  the count of Archived GPID list is zero  and Active is non zero - Done
3.for each active gpid call exportprocedure Lambda by passing the mrnnumber 
  as surgeonname/gpid - Done
4.Call Zippper Lambda passing the path as destbucketname/surgeonname - Done
5.If retain data is selected then call Archive Procedure Lambda.
6.If delete is seleceted delete all the objects from media bucket and delete from DB.
7.Change status to terminated and send email. - Done*/

exports.handler = async (event, context) => {
    // TODO implement
    try {
        environment = await getParameterFromSystemManager(envPath);
        lensmediaBucket = environment['envprefix'] + '-lensmediabucket';
        procedureArchiveBucket = environment['envprefix'] + '-patientprocedure-archive';
        var terminationInProgressDetails = await getTerminationInProgressRequests();
        console.log('terminationInProgressDetails----', terminationInProgressDetails);

        for (let i = 0; i < terminationInProgressDetails.length; i++) {

            var surgeonName = terminationInProgressDetails[i]['surgeon'];

            if (terminationInProgressDetails[i]['archivedgpIds'].length == 0) {
                var gpids = terminationInProgressDetails[i]['gpIds'];
                for (let j = 0; j < terminationInProgressDetails[i]['gpIds'].length; j++) {
                    if (terminationInProgressDetails[i]['exportdatafromservice'] === true) {
                        var gpid = gpids[j];
                        var folderName = surgeonName + '/' + gpid;
                        var payloadJsonExport = {
                            "surgeonname": surgeonName,
                            "gpid": gpid,
                            "mrnnumber": folderName,
                            "tokenId": "Random token",
                            "lambda": "#1234lambd@_tr1gger4321#"
                        };
                        await processExport(payloadJsonExport); // Copiying each individual objects of each GPID

                    }
                }

                if (terminationInProgressDetails[i]['terminationAction'] == 'RetainData') {
                    var payloadJsonArchive = {
                        'gpid': gpids,
                        'tokenid': 'Random token',
                        'lambda': '#1234lambd@_tr1gger4321#',
                        'surgeonid': surgeonName

                    };
                    console.log('Selected Archive data..');
                    await processArchive(payloadJsonArchive);
                } else if (terminationInProgressDetails[i]['terminationAction'] == 'PermanentlyDeleteData') {
                    //Needs to delete the object from s3 and DB Entries
                    console.log("Data deleted permanently for gpids--", gpids);

                    for (let i = 0; i < gpids.length; i++) {
                        await permanentlyDelete(gpids[i], surgeonName);
                    }

                    await deleteUserData(surgeonName);
                }

                // ZIP the entire Surgeonname root folder if export is selected while termination.
                var rootFolderName = terminationInProgressDetails[i]['surgeon'];
                var email = terminationInProgressDetails[i]['email'];

                if (terminationInProgressDetails[i]['exportdatafromservice'] === true) {
                    var payloadJsonZip = {
                        "mrnnumber": rootFolderName,
                        "emailid": email,
                        "surgeonname": surgeonName

                    };
                    await zipData(payloadJsonZip);
                }
                
                // Send final email of termination success email and updated the DB 
                console.log('Final entry', i);
                await sendEmail(terminationInProgressDetails[i]['email'], terminationInProgressDetails[i], surgeonName);
                await updateterminationStatus(surgeonName);
                var adminDetails = await getAdminDetails(surgeonName);
                if (adminDetails['adminId']) {
                    console.log('AdminDetails****', adminDetails);
                    let ssmPath = '/terminationProcessed/en/'; // Considering en language for all admins
                    let notificationParams = await getParameterFromSystemManager(ssmPath) || {};
                    var cloudMessage = notificationParams['cloud_message'] || '' ;
                    var placeholderObj = {
                        placehold_name: terminationInProgressDetails[i]['userlastname'] + "," + terminationInProgressDetails[i]['userfirstname'],
                        placehold_username: terminationInProgressDetails[i]['surgeon'],
                        placehold_email: terminationInProgressDetails[i]['email'],
                        placehold_phone: terminationInProgressDetails[i]['userphone']
                    };
                    cloudMessage = replacePlacholders(cloudMessage, placeholderObj);
                    await saveNotification(adminDetails['adminId'], cloudMessage);
                }
            }

        }
    } catch (err) {
        console.log('GetSSMParam-error', err);
    }
};


function getTerminationInProgressRequests() {
    console.log("calling getTerminationRequests");

    return new Promise((resolve, reject) => {
        var data = [TERMINATION_INPROGRESS];
        const options = {
            host: environment['API_host'],
            port: environment['API_port'],
            path: '/subscription/termination/process',
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Actor': 'From ProcessTerminateSubscriptionRequests function',
                'lambda': '#1234lambd@_tr1gger4321#'
            }
        };


        const req = http.request(options, (res) => {
            console.log('ststus code--', res.statusCode);
            if (res.statusCode == 202) {
                console.log('Success in getting termination in progress request : ');
            } else {
                console.error('Error in getting termination in progress request: ');
            }
            res.setEncoding('utf8');
            var str = '';
            res.on('data', function (chunk) {
                str += chunk;

            });
            res.on('error', function (e) {
                console.log("getTerminationInProgressRequests Got error: " + e.message);

            });

            res.on('end', () => {
                var terminationRequests = JSON.parse(str);
                resolve(terminationRequests);
            });
        });

        // send the request
        req.write(JSON.stringify(data));
        req.end();


    });
}

function processExport(payloadJson) {
    console.log("calling processTerminationRequest");

    return new Promise((resolve, reject) => {
        lambda.invoke({
            FunctionName: environment['envprefix']+'_ExportpatientprocedureFunction',
            Payload: JSON.stringify(payloadJson)
        }, function (err, data) {
            console.log('exportpatientprocedure Function call');
            if (err) {
                console.log('error in exportpatientprocedure : ' + err);
                reject(false);
            } else if (data) {
                console.log("exportpatientprocedure success");
                resolve(true);
            }
        });
    });
}


function zipData(payloadJson) {
    payloadJson['exporttype'] = 'cancellation';
    console.log("calling processTerminationRequest");

    return new Promise((resolve, reject) => {
        lambda.invoke({
            FunctionName: environment['envprefix']+'_JavaS3ZipperFunction',
            Payload: JSON.stringify(payloadJson)
        }, function (err, data) {
            console.log('JavaS3ZipperFunction Function call');
            if (err) {
                console.log('error in JavaS3ZipperFunction : ' + err);
                reject(false);
            } else if (data) {
                console.log("JavaS3ZipperFunction success");
                resolve(true);
            }
        });
    });
}


function updateterminationStatus(username) {
    console.log('Update status called..');
    return new Promise((resolve, reject) => {
        var res = '/subscription/status/' + TERMINATED;
        const options = {
            host: environment['API_host'],
            port: environment['API_port'],
            path: res,
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Actor': username,
                'lambda': '#1234lambd@_tr1gger4321#'
            }
        };

        var bodyString = JSON.stringify({
            'Actor': username,

        });

        const req = http.request(options, (res) => {
            console.log('ststus code in update status--', res.statusCode);
            if (res.statusCode == 202) {
                console.log('Success in termination status of the subscription of user: ', username);
            } else {
                console.error('Error in termination status of the subscription of user: ', username);
            }
            res.setEncoding('utf8');
            var str = '';
            res.on('data', function (chunk) {
                str += chunk;
            });
            res.on('error', function (e) {
                console.log("updateterminationStatus Got error: " + e.message);

            });

            res.on('end', () => {
                console.log("updateterminationStatus data from db" + JSON.parse(str));
                resolve(str);
            });
        });

        // send the request
        req.write(bodyString);
        req.end();

    });

}

async function sendEmail(to, userdata, surgeonid) {
    console.log("to-sendEmail-" + to);
    let lang  = await getUserLanguage(surgeonid);
    let ssmPath = '/terminationProcessed/' + lang + '/';
    let emailParams = await getParameterFromSystemManager(ssmPath) || {};
    return new Promise((resolve, reject) => {
        var eParams = {
            Destination: {
                ToAddresses: [to]
            },
            Message: {
                Body: {
                    Html: {
                        Charset: "UTF-8",
                        Data: generateHTMLEmail(emailParams, userdata)
                    }
                },
                Subject: {
                    Charset: "UTF-8",
                    Data: emailParams['email_subject']
                }
            },

            // Replace source_email with your SES validated email address
            Source: environment['id_emailsource']
        };

        ses.sendEmail(eParams, function (err, data) {
            if (err) {
                console.log(err);
                reject(err);
            } else {
                console.log("===EMAIL SENT===");
                resolve("===EMAIL SENT===");
            }
        });

        console.log("EMAIL CODE END");
    });
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

function processArchive(payloadJson) {
    console.log("calling processTerminationRequest");

    return new Promise((resolve, reject) => {
        lambda.invoke({
            FunctionName: environment['envprefix']+'_ArchiveProcedureFunction',
            Payload: JSON.stringify(payloadJson)
        }, function (err, data) {
            console.log('ArchiveProcedure Function call');
            if (err) {
                console.log('error in ArchiveProcedure : ' + err);
                reject(false);
            } else if (data) {
                console.log("ArchiveProcedure success");
                resolve(true);
            }
        });
    });
}

function deleteUserData(username) {

    console.log('Delete data called..');
    return new Promise((resolve, reject) => {
        var path = '/surgeon/data';
        const options = {
            host: environment['API_host'],
            port: environment['API_port'],
            path: path,
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'lambda': '#1234lambd@_tr1gger4321#',
                'surgeonid': username,
                'Authorization': 'Random token'
            }
        };

        const req = http.request(options, (res) => {
            console.log('ststus code in update status--', res.statusCode);
            if (res.statusCode == 202) {
                console.log('Success in termination deleteUserData of user: ', username);
            } else {
                console.error('Error in termination deleteUserData of user: ', username);
            }
            res.setEncoding('utf8');
            var str = '';
            res.on('data', function (chunk) {
                str += chunk;
                console.log('deleteUserData Response: ' + str);
                resolve(str);

            });
            res.on('error', function (e) {
                console.log("deleteUserData Got error: " + e.message);

            });

            res.on('end', () => {
                console.log("deleteUserData data from db" + JSON.parse(str));

            });
        });


        req.end();

    });


}


function permanentlyDelete(gpid, surgeonName) {
    console.log('Permanently delete called..');
    return new Promise((resolve, reject) => {

        var path = '/patient/procedure/' + gpid;
        var header;

        header = {
            'Content-Type': 'application/json',
            'Authorization': 'Random Token',
            'surgeonid': surgeonName,
            'lambda': '#1234lambd@_tr1gger4321#'

        }

        console.log('Delete data****', header.surgeonid);
        const options = {
            host: environment['API_host'],
            port: environment['API_port'],
            path: path,
            method: 'GET',
            headers: header
        };
        console.log("Before permanentlyDelete request", options.headers.surgeonid);

        const req = http.request(options, (res) => {
            console.log('Web service called and response code--', res.statusCode);
            if (res.statusCode == 200) {
                var str = '';
                res.on('data', function (chunk) {
                    str += chunk;
                });

                res.on('end', () => {
                    var obj = JSON.parse(str);
                    console.log("API  Response patient/procedure/---", obj);

                    for (var i in obj) {
                        if (i == 'procedureinfo') {
                            var newObj = obj[i];
                            for (var k in newObj) {
                                if (k == 'annotations') {
                                    var glabalannotations = newObj[k];

                                    glabalannotations.forEach((glabalannotationsitems, index) => {

                                        for (var key in glabalannotationsitems) {
                                            if (key == 'fileurl') {
                                                if (glabalannotationsitems[key] != undefined) {
                                                    var innerpath = glabalannotationsitems[key];
                                                    var objectPath = lensmediaBucket+'/' + glabalannotationsitems[key];
                                                    var lastSpecialPosition = objectPath.lastIndexOf("/");
                                                    var destination = procedureArchiveBucket+'/' + innerpath.substring(0, innerpath.lastIndexOf("/"));
                                                    console.log(destination);
                                                    var destKey = objectPath.substring(lastSpecialPosition + 1, objectPath.length);
                                                    console.log('before calling global---', innerpath);
                                                    var globalParam = {
                                                        Bucket: lensmediaBucket,
                                                        Key: innerpath
                                                    };
                                                    deleteObject(globalParam);

                                                    //       copyObject(objectPath,destination,destKey,innerpath,archivalstatus);
                                                }
                                            }
                                        }

                                    });

                                }

                            }
                        }
                        console.log("In archive 2:" + i);
                        if (i == 'camerasettings') {
                            var camerasettings = obj[i];

                            camerasettings.forEach((item, index) => {
                                for (var key in item) {
                                    if (key == 'media') {

                                        var media = item[key];
                                        media.forEach((item1, index) => {
                                            for (var key in item1) {

                                                if (key == 'fileurl') {
                                                    if (item1[key] != undefined) {
                                                        var innerpath = item1[key];
                                                        var mediaPath = lensmediaBucket+'/' + item1[key];
                                                        var lastIndexMedia = mediaPath.lastIndexOf("/");
                                                        var destinationMedia = procedureArchiveBucket+'/' + innerpath.substring(0, innerpath.lastIndexOf("/"));

                                                        console.log(destinationMedia);
                                                        var destMediaKey = mediaPath.substring(lastIndexMedia + 1, mediaPath.length);
                                                        console.log('before calling media---', innerpath);
                                                        var imageParam = {
                                                            Bucket: lensmediaBucket,
                                                            Key: innerpath
                                                        };
                                                        deleteObject(imageParam);

                                                        var paramsImages = {
                                                            Bucket: lensmediaBucket,
                                                            Key: getImageThumbnailPath(innerpath)
                                                        };
                                                        deleteObject(paramsImages);

                                                        var paramsVideos = {
                                                            Bucket: lensmediaBucket,
                                                            Key: getVideoThumbnailPath(innerpath)
                                                        };
                                                        deleteObject(paramsVideos);

                                                    }
                                                }
                                                if (key == 'annotations') {

                                                    var localAnnotations = item1[key];

                                                    localAnnotations.forEach((localannotationsItem, index) => {
                                                        for (var key in localannotationsItem) {

                                                            if (key == 'fileurl') {
                                                                if (localannotationsItem[key] != undefined) {
                                                                    var innerpath = localannotationsItem[key];
                                                                    var localannotationpath = lensmediaBucket+'/' + localannotationsItem[key];
                                                                    var lastIndexLocal = localannotationpath.lastIndexOf("/");
                                                                    var destinationLocal = procedureArchiveBucket+'/' + innerpath.substring(0, innerpath.lastIndexOf("/"));

                                                                    console.log(destinationLocal);
                                                                    var destLocalKey = localannotationpath.substring(lastIndexLocal + 1, localannotationpath.length);
                                                                    console.log('before calling local---', innerpath);
                                                                    var localParam = {
                                                                        Bucket: lensmediaBucket,
                                                                        Key: innerpath
                                                                    };
                                                                    deleteObject(localParam);

                                                                }
                                                            }
                                                        }
                                                    });

                                                }
                                            }

                                        });

                                    }


                                }

                            });

                        }


                    }


                });


            } else {
                console.log('Error from web service' + res.statusCode);
            }
        });


        req.on('error', (e) => {
            console.log('Error Message Patient Details: ' + e.message);

        });

        console.log('End Data call');
        req.end();
        resolve('Done');


    });
}


function getAdminDetails(surgeonname) {
    console.log('Admin Details called..');
    return new Promise((resolve, reject) => {
        var header = {
            'Content-Type': 'application/json',
            'Authorization': 'Random Token',
            'surgeonid': surgeonname,
            'lambda': '#1234lambd@_tr1gger4321#'
        }


        var path = '/user/adminDetails';
        const options = {
            host: environment['API_host'],
            port: environment['API_port'],
            path: path,
            method: 'GET',
            headers: header
        };
        console.log('Before getAdminDetails the request', options.headers.surgeonid);
        const req = http.request(options, (res) => {
            console.log('Web service called and response code--', res.statusCode);
            if (res.statusCode == 200) {
                var str = '';
                res.on('data', function (chunk) {
                    str += chunk;
                });
                res.on('end', () => {
                    console.log("Details from DB" + JSON.parse(str));
                    var adminDetails = JSON.parse(str);
                    resolve(adminDetails);
                });

            } else {
                console.log('Error from web service' + res.statusCode);
            }
        });

        req.on('error', (e) => {
            console.log('Error Message: ' + e.message);
        });

        console.log('End Data call');
        req.end();
    });

}

function saveNotification(userId, notificationtext) {

    return new Promise((resolve, reject) => {

        var data = JSON.stringify({

            'notificationtype': "Terminate Subscription",
            'notificationtext': notificationtext

        });
        console.log('saveNotification data**', data);
        console.log('saveNotification userid**', userId);
        var headers = {
            'Content-Type': 'application/json',
            'Content-Length': data.length,
            'lambda': '#1234lambd@_tr1gger4321#',
            'Authorization': 'Random Token',
            'surgeonid': userId
        };

        var options = {
            //host: 'ec2-35-172-158-187.compute-1.amazonaws.com',
            host: environment['API_host'],
            path: '/notification',
            port: environment['API_port'],
            method: 'POST',
            headers: headers
        };

        // Set up the request
        var post_req = http.request(options, function (res) {
            console.log('Web service called and response code--', res.statusCode);
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                var str = '';
                res.on('data', function (chunk) {
                    str += chunk;
                });
                res.on('end', () => {
                    console.log('Inside end..');
                    console.log('str***', str);
                    resolve(str);
                });

            });
            res.on('error', function (e) {
                console.log("Got error: " + e.message);

            });

        });

        var jsonToSend = JSON.parse(data);
        // post the data
        post_req.write(data);
        post_req.end();

    });
}

function deleteObject(params) {
    s3.deleteObject(params, function (err, data) {
        if (err) {
            console.log(err, err.stack); // an error occurred
            console.log('Error in deleting object--', params.Key);
        } else {
            console.log(data);           // successful response
            console.log('Object deleted--', params.Key);

        }

    });
}

function getImageThumbnailPath(objectPath) {
    var lastSpecialPosition = objectPath.lastIndexOf("/");
    return objectPath.substring(0, lastSpecialPosition) + '/Thumb_' + objectPath.substring(lastSpecialPosition + 1, objectPath.length)
}


function getVideoThumbnailPath(objectPath) {
    var lastSpecialPosition = objectPath.lastIndexOf("/");
    var videothumbPath = objectPath.substring(0, lastSpecialPosition) + '/Thumb_' + objectPath.substring(lastSpecialPosition + 1, objectPath.length)
    var lastDotPosition = videothumbPath.lastIndexOf(".");
    var pathAfterRemovingExtention = videothumbPath.replace(videothumbPath.substring(lastDotPosition + 1, videothumbPath.length), '');
    return pathAfterRemovingExtention + 'jpg';

} 


function generateHTMLEmail(emailParams, userdata) {
    var content = emailParams['email_message'] || '' ;
    var placeholderObj = {
        placehold_name: userdata['userlastname'] + " " + userdata['userfirstname'],
        placehold_username: userdata['surgeon'],
        placehold_email: userdata['email'],
        placehold_phone: userdata['userphone']
    };
    content = replacePlacholders(content, placeholderObj);
    var emailHtml = emailParams['email_body_template'];
    placeholderObj = {
        placehold_message: content,
        placehold_logopath: environment['url_intelliologo']
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