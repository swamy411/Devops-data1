var AWS = require('aws-sdk');
var ssm = new AWS.SSM();
var envPath = process.env.ssm_store;
var environment = {};
var http = require('http');
var ses = new AWS.SES();
AWS.config.update({
    region: 'us-east-1'
});
var s3 = new AWS.S3({
    apiVersion: '2006-03-01'
});
var surgeonname;
var keyname;
var cognitoidentityserviceprovider = new AWS.CognitoIdentityServiceProvider();
var antivirusBucket;
var lensmediaBucket;

exports.handler = (event, context) => {
    var envReq = getParameterFromSystemManager();
    envReq.then(() => {
        // TODO implement
        antivirusBucket = environment['envprefix'] + '-antivirus-bucket';
        lensmediaBucket = environment['envprefix'] + '-lensmediabucket';
        console.log('test');
        // async.each(event.Records, processSingleEventRecord, context.done);
        processSingleEventRecord(event, context.done);
    }).catch((err) => {
        console.log('GetSSMParam-error', err);
    });
};

function processSingleEventRecord(event, callback) {
    var params = {
        Bucket: antivirusBucket
    };

    s3.listObjects(params, (err, data) => {
        if (err) {
            console.log(err, err.stack); // an error occurred

        } else {
            console.log(data);
            let contents = data.Contents;
            for (var i = 0; i < contents.length; i++) {
                processPerObject(data.Contents[i]);
            }
        } // main IF Construct of S3 Object
    });

} //processingSingleEvent Construct

function getHeadDetails(params1) {
    return new Promise((resolve, reject) => {

        s3.headObject(params1, (errHead, dataHead) => {
            if (errHead) {
                var error_message = 'Error in getting  metadata for bucket antivirus-bucket: ' +
                    ', key: ' + keyname + ', Error: ' + errHead;
                console.error(error_message);
                reject(errHead);
            } else {

                resolve(dataHead);
            }

        });
    });
}

async function processPerObject(contents) {
    if (contents.Size != 0) {
        var params1 = {
            Bucket: antivirusBucket,
            Key: contents.Key

        };
        console.log(params1);
        keyname = contents.Key;
        console.log('#### Key Name ####', keyname);

        var headPromise = getHeadDetails(params1);
        headPromise.then((dataHead) => {
                s3.getObjectTagging(params1, (errTag, dataTag) => {
                    if (errTag) {
                        console.log("error---", errTag.stack, params1, errTag); // an error occurred
                    } else {
                        var obj = dataTag;
                        console.log('Data head metadata ', dataHead.Metadata);
                        surgeonname = dataHead.Metadata['surgeonname'] ? dataHead.Metadata['surgeonname'] : '';
                        console.log(dataTag);
                        console.log('obj[j]---', obj['TagSet']);
                        if (obj['TagSet'].length !== 0) {

                            if (typeof obj['TagSet'][0].Key !== 'undefined') {
                                console.log('Key after scanning---', params1.Key);
                                var objectPath = params1.Key;
                                var source = antivirusBucket+'/' + params1.Key;
                                console.log('source---', source);
                                var destination = lensmediaBucket+'/' + params1.Key.substring(0, params1.Key.lastIndexOf("/"));
                                console.log('destination---', destination);
                                var destKey = params1.Key.substring(params1.Key.lastIndexOf("/") + 1, params1.Key.length);
                                console.log('destKey---', destKey);

                                if (obj['TagSet'][0].Key == 'clamav-status' && obj['TagSet'][0].Value == 'clean') {

                                    if (destKey != null) {
                                        //file is clean.Log entry into audit log
                                        webAPIAntiVirusLog("1", surgeonname, destKey);
                                    }

                                    s3.copyObject({
                                        CopySource: source,
                                        Bucket: destination,
                                        Key: destKey,
                                        StorageClass: 'STANDARD'
                                    }, (copyErr, copyData) => {
                                        if (copyErr) {
                                            console.log("Error in copying object--", copyErr);
                                        } else {
                                            console.log('Object copied--', copyData);
                                            var params = {
                                                Bucket: antivirusBucket,
                                                Key: objectPath
                                            };
                                            deleteObject(params);
                                        }
                                    });

                                } else {

                                    //delete the file from anti-virus bucket
                                    var params2 = {
                                        Bucket: antivirusBucket,
                                        Key: params1.Key
                                    };
                                    deleteObject(params2);
                                    updateObjectDeleteStatus(dataHead);
                                    sendEmail(dataHead, destKey);
                                    //file is infected. Log into auditlog
                                    if (destKey != null) {
                                        console.log("Infected Filename:" + destKey);
                                        webAPIAntiVirusLog("2", surgeonname, destKey);

                                        webAPIAntiVirusLog("3", surgeonname, destKey);
                                    }

                                }
                            } // undefined IF construct

                        } // IF LEN(0)
                    }
                });
            },
            (err) => {
                console.log('error ', err);
            }
        )
    }
}


function deleteObject(params) {
    s3.deleteObject(params, (err, data) => {
        if (err) {
            console.log(err, err.stack); // an error occurred
            console.log('Error in deleting object--', params.Key);
        } else {
            console.log('Object deleted--', params.Key);
        }
    });
}

function webAPIAntiVirusLog(opt, msurgeon, mfilename) {
    var urlpath;
    var strResponse = "call from copyScannedObjects Lambda";
    console.log('in webapi opt, surgeon:', opt, msurgeon, mfilename);
    if (opt == "1") {
        urlpath = '/lambda/antivirusFileClean';
    } else if (opt == "2") {
        urlpath = '/lambda/antivirusFileInfected';
    } else if (opt == "3") {
        urlpath = '/lambda/antivirusFileDeleted';
    }


    console.log('path:', urlpath);

    const apioptions = {
        hostname: environment['API_host'],
        port: environment['API_port'],
        path: urlpath,
        method: 'HEAD',
        headers: {
            'Actor': msurgeon,
            'Filename': mfilename,
            'lambda': '#1234lambd@_tr1gger4321#'
        }
    };

    const req = http.request(apioptions, (res) => {
        // console.log(`STATUS: ${res.statusCode}`);
        // console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
        //res.setEncoding('utf8');
        res.on('data', (chunk) => {
            //   console.log(`Inside BODY: ${chunk}`);
        });
        res.on('end', () => {
            //   console.log('No more data in response.');
        });
    });

    req.on('error', (e) => {
        // console.error(`problem with request: ${e.message}`);
    });

    // Write data to request
    req.write(strResponse);
    //setTimeout(500);
    req.end();

}

function updateObjectDeleteStatus(dataHead) {
    let input;
    let gpid = dataHead.Metadata['gpid'];
    let mediaid = dataHead.Metadata['mediaid'];
    let surgeonname = dataHead.Metadata['surgeonname'] ? dataHead.Metadata['surgeonname'] : '';
    let annotationid = dataHead.Metadata['annotationid'];

    let mediaObj = JSON.stringify({
        "gpid": gpid,
        "surgeonname": surgeonname,
        "medias": [{
            "mediaid": mediaid
        }],
        "globalannotations": [],
        "localannotations": []
    });

    let globalAnnotation = JSON.stringify({
        "gpid": gpid,
        "surgeonname": surgeonname,
        "medias": [],
        "globalannotations": [{
            "annotationid": annotationid
        }],
        "localannotations": []
    });

    let localAnnotation = JSON.stringify({
        "gpid": gpid,
        "surgeonname": surgeonname,
        "medias": [{
            "mediaid": mediaid
        }],
        "globalannotations": [],
        "localannotations": [{
            "annotationid": annotationid
        }]
    });
    if (mediaid != undefined && annotationid == undefined) {
        input = mediaObj;
    } else if (mediaid == undefined && annotationid != undefined) {
        input = globalAnnotation;
    } else if (mediaid != undefined && annotationid != undefined) {
        input = localAnnotation;
    }
    console.log('input delete object status ', input);
    const options = {
        host: environment['API_host'],
        port: environment['API_port'],
        path: '/patient/procedure',
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'RandomTokenFromScanInfected',
            'lambda': '#1234lambd@_tr1gger4321#',
            'surgeonid': surgeonname
        }
    };


    console.log('---In object update--');
    console.log('options---', options);
    console.log('bodyString---', input);

    const req = http.request(options, (res) => {
        console.log('res.statusCode----', res.statusCode);
        if (res.statusCode == 204) {
            console.log('Success in updating archival status of the object : ');
        } else {
            console.error('Error in updating archival status of the object: ');

        }

        res.on('data', (d) => {
            process.stdout.write(d)
        })
    })

    req.on('error', (error) => {
        console.error(error)
    })
    req.useChunkedEncodingByDefault = true;
    req.write(input)
    req.end()

    // http.request(options, deleteCallback).write(input);
}

function sendEmail(data, imageName) {
    let surgeonname = data.Metadata['surgeonname'];
    let gpid = data.Metadata['gpid'];
    const params = {
        UserPoolId: 'us-east-1_cWMNjCSVb',
        Username: surgeonname
    };
    cognitoidentityserviceprovider.adminGetUser(params, (errDetail, dataDetail) => {
        if (errDetail) {
            console.log('Error Detail');
            console.log(errDetail);
        } else {
            console.log('Data Detail');
            console.log(dataDetail);
            let attributes = dataDetail.UserAttributes;
            let email = attributes.filter((attribute) => {
                return attribute.Name === 'email';
            });

            let emailValue = email[0]['Value'] ? email[0]['Value'] : '';
            var subject = 'Infected file found';
            var eParams = {
                Destination: {
                    ToAddresses: [emailValue]
                },
                Message: {
                    Body: {
                        Html: {
                            Charset: "UTF-8",
                            Data: generateHTMLEmail(gpid, imageName)
                        }
                    },
                    Subject: {
                        Data: subject
                    }
                },

                // Replace source_email with your SES validated email address
                Source: environment['id_emailsource']
            };

            ses.sendEmail(eParams, function (err, data) {
                if (err) {
                    console.log(err);
                } else {
                    console.log("===EMAIL SENT===");
                }

            });
            console.log("EMAIL CODE END");


        }
    });
}

function generateHTMLEmail(gpId, imageName) {
    return `
        <!DOCTYPE html>
         <html>
           <head>
             <meta charset='UTF-8' />
           </head>
           <body>
            <table border='0' cellpadding='0' cellspacing='0' height='100%' width='100%' id='bodyTable'>
             <tr>
                 <td align='center' valign='top'>
                     <table border='0' cellpadding='20' cellspacing='0' width='600' class='table' id='emailContainer'>
                         <tr style='background-color:#ffffff;'>
                             <td align='center' valign='top'>
                                 <table border='0' cellpadding='1' cellspacing='0' width='100%' class='table' id='emailBody'>
									 <tr>
										<td align='left'><div style="background-color:#ff8119;margin: auto;padding:5px 10px;">&nbsp;&nbsp; <img src=${environment['url_intelliologo']} /></div></td>
									 </tr>
                                     <tr>
                                         <td valign='top' style='color:#e25a0f;'>
											 <p style='color:#505050'>You recently uploaded a file ${imageName} to your Patient Procedure with GPID ${gpId}. The file was found to be infected with a virus and the same has been removed from the Cloud. If you want to upload this file again, repeat the process with a cleaner version of the file.</p>
                                         </td>
                                     </tr>
									 </tr>
                                 </table>
                             </td>
                         </tr>
                     </table>
                 </td>
             </tr>
             </table>
           </body>
		   <style>
		   .table{
			border-radius: 4px 4px 0 0;
			background-clip: padding-box;
			border: 1px solid #e2e2e2;
		   }
		   </style>
         </html>`
}

function getParameterFromSystemManager() {
    return new Promise((resolve, reject) => {
        var params = {
            Path: envPath,
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
                    key = key.replace(envPath , '');
                    key = key.replace('/', '_');
                    env[key] = eachItem.Value;
                });
                environment = env;
                resolve(true);
            }
        });
    });
}