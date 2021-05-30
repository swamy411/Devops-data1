var aws = require('aws-sdk');
var fs = require('fs');
var http = require('http');
var s3 = new aws.S3();
var ses = new aws.SES();
var lambda = new aws.Lambda({
    region: 'us-east-1'
});
var S3Zipper = require('aws-s3-zipper');

var config = {
    accessKeyId: "AKIAIX4WXWCVGHKCKTKA",
    secretAccessKey: "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",
    region: "us-east-1",
    bucket: "dev-terminationsubscriptionbucket",
};

var zipper = new S3Zipper(config);

const SUBSCRIPTION_TERMINATION_EVENTS_ENUM = {
    RetainData: 'RetainData',
    PermanentlyDeleteData: 'PermanentlyDeleteData'
};

const SUBSCRIPTION_EVENTS_ENUM = {
    TerminationApproved: 'TerminationApproved',
    TerminationRejected: 'TerminationRejected'
};

exports.handler = (event, context, callback) => {
    var surgeonArr = event["surgeons"];
    for (let i = 0; i < surgeonArr.length; i++) {
        var user = surgeonArr[i];
        var emailSubject = "Request for subscription termination for " + user['surgeon'];
        var emailBody = "Your request for susbcription terminaton is ";
        var path = '/subscription/termination/terminationActionDetails/' + user['surgeon'];
        var email = user['email'];
        var tokenId = event['tokenId'];
        var isTerminationApproved = user['isTerminationApproved'] == "false" ? false : true;
        const options = {
            host: '10.182.0.113',
            port: 8080,
            path: path,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': tokenId
            }
        };

        if (!isTerminationApproved) {
            updateterminationStatus(tokenId, user['surgeon'], isTerminationApproved ? SUBSCRIPTION_EVENTS_ENUM.TerminationApproved : SUBSCRIPTION_EVENTS_ENUM.TerminationRejected);
            sendEmail(email, emailSubject, emailBody + "rejected");
            continue;
        }

        const req = http.request(options, (res) => {
            console.log('Web service called and response code--', res.statusCode);

            if (res.statusCode != 200) {
                console.log('Error from web service' + res.statusCode);
            } else {
                var str = '';
                res.on('data', function(chunk) {
                    str += chunk;
                });

                res.on('end', () => {
                    var arrSurgeonDetails = JSON.parse(str);
                    for (let j = 0; j < arrSurgeonDetails.length; j++) {
                        processTerminationActionForProcedure(tokenId, isTerminationApproved, arrSurgeonDetails[j]);
                    }
                    updateterminationStatus(tokenId, user['surgeon'], isTerminationApproved ? SUBSCRIPTION_EVENTS_ENUM.TerminationApproved : SUBSCRIPTION_EVENTS_ENUM.TerminationRejected);
                    sendEmail(email, emailSubject, emailBody + "approved and proccessed successfully")
                });
            }
        });

        req.on('error', (e) => {
            console.log('Error Message: ' + e.message);
        });
        console.log('End Data call');
        req.end();
        callback(null, 'pass');
    };
};


function processTerminationActionForProcedure(tokenId, isTerminationApproved, surgeonDetails) {
    var surgeon = surgeonDetails['surgeon'];
    var terminationAction = surgeonDetails['terminationAction'];
    var isExportdatafromservice = surgeonDetails['exportdatafromservice'] != null && surgeonDetails['exportdatafromservice'] == "true" ? true : false;
    var gpid = surgeonDetails['gpid'];
    var awsFolderName = "/public/" + gpid;
    var s3bucketName = "dev-lensmediabucket";
    var s3ArchivebucketName = "dev-patientprocedure-archive";
    var terminationBucket = "dev-terminationsubscriptionbucket";

    if (isTerminationApproved && isExportdatafromservice) {
        console.log("exporting data to surgeon - " + surgeon);
        lambda.invoke({
            FunctionName: 'dev_RestoreProcedure',
            Payload: gpid
        }, function(err, data) {
            console.log('Function call');
            if (err) {
                console.log('error : ' + err);
            } else if (data) {
                console.log(data);
                var destinationFolder = SUBSCRIPTION_TERMINATION_EVENTS_ENUM.ExportDataFromService + "_" + surgeon;
                copyFromS3Bucket(s3bucketName, terminationBucket, awsFolderName, destinationFolder);
            }
        });
    }

    if (isTerminationApproved && terminationAction == (SUBSCRIPTION_TERMINATION_EVENTS_ENUM.PermanentlyDeleteData)) {
        console.log("deleting data from s3 bucket and  archive for surgeon - " + surgeon);
        deleteFromS3AndS3Archive(s3bucketName, s3ArchivebucketName, awsFolderName, surgeon, tokenId, gpid);
    }
};


async function deleteFromS3AndS3Archive(s3Bucket, s3ArchiveBucket, folderName, surgeon, tokenId, gpid) {
    const s3BucketListParams = {
        Bucket: s3Bucket,
        Prefix: folderName
    };

    const s3ArchiveBucketListParams = {
        Bucket: s3ArchiveBucket,
        Prefix: folderName
    };


    const s3BucketListedObjects = await s3.listObjectsV2(s3BucketListParams).promise();
    const s3ArchiveBucketListedObjects = await s3.listObjectsV2(s3ArchiveBucketListParams).promise();

    if (s3BucketListedObjects.Contents.length === 0 && s3ArchiveBucketListedObjects.Contents.length === 0) return;

    const s3BucketDeleteParams = {
        Bucket: s3Bucket,
        Delete: {
            Objects: []
        }
    };

    const s3ArchiveBucketDeleteParams = {
        Bucket: s3ArchiveBucket,
        Delete: {
            Objects: []
        }
    };

    s3BucketListedObjects.Contents.forEach(({
        Key
    }) => {
        s3BucketDeleteParams.Delete.Objects.push({
            Key
        });
    });

    s3ArchiveBucketListedObjects.Contents.forEach(({
        Key
    }) => {
        s3ArchiveBucketDeleteParams.Delete.Objects.push({
            Key
        });
    });

    try {
        await s3.deleteObjects(s3BucketDeleteParams).promise();
        await s3.deleteObjects(s3ArchiveBucketDeleteParams).promise();
        console.log("deleted data for surgeon from db - " + surgeon);
        deleteProcedureFromDB(tokenId, gpid);
    } catch (err) {
        console.log(err);
    }

}


function updateterminationStatus(tokenId, surgeon, action) {
    var res = '/subscription/termination/response';
    const options = {
        host: '10.182.0.113',
        port: 8080,
        path: res,
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': tokenId
        }
    };

    var bodyString = JSON.stringify({
        'subscriptionTerminationAction': action,
        'surgeon': surgeon
    });

    var req = http.request(options, putCallback).write(bodyString);
    req.end();
}

var putCallback = function(response) {
    var statusCode = response.statusCode;
    console.log(statusCode);
    var str = '';
    // another chunk of data has been recieved, so append it to `str`
    response.on('data', function(chunk) {
        str += chunk;
    });

    // the whole response has been recieved, so we just print it out here
    response.on('end', function() {

        if (statusCode == 202) {
            console.log('Success in updating termination status of the surgeon : ', );
        } else {
            console.error('Error in updating termination status of the surgeon: ');
        }
    });
};


function deleteProcedureFromDB(tokenId, gpid) {
    const options = {
        host: '10.182.0.113',
        port: 8080,
        path: '/patient/procedure/' + gpid,
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': tokenId
        }
    };

    var req = http.request(options, deleteCallback);
    req.end();

}

var deleteCallback = function(response) {
    var statusCode = response.statusCode;
    console.log(statusCode);
    var str = '';
    // another chunk of data has been recieved, so append it to `str`
    response.on('data', function(chunk) {
        str += chunk;
    });

    // the whole response has been recieved, so we just print it out here
    response.on('end', function() {

        if (statusCode == 200) {
            console.log('Success in delete procedure');
        } else {
            console.error('Error in delete procedure');
        }
    });
};

function sendEmail(to, subject, body) {
    console.log("to--" + to);
    console.log("subject-" + subject);
    console.log("body--" + body);

    var eParams = {
        Destination: {
            ToAddresses: [to]
        },
        Message: {
            Body: {
                Text: {
                    Charset: "UTF-8",
                    Data: body
                }
            },
            Subject: {
                Charset: "UTF-8",
                Data: subject
            }
        },

        // Replace source_email with your SES validated email address
        Source: "<snnoreply@maildrop.cc>"
    };

    ses.sendEmail(eParams, function(err, data) {
        if (err) {
            console.log(err);
        } else {
            console.log("===EMAIL SENT===");
        }

    });
    console.log("EMAIL CODE END");
};

function createZip(destinationBucket, destinationFolder) {
    //-----------Zip folder----------------------// 
    console.log('createing zip');
    zipper.zipToS3File({
        s3FolderName: destinationFolder,
        s3ZipFileName: destinationFolder + '.zip',
        recursive: true
    }, function(err, result) {
        if (err) {
            console.log('error');
            console.error(err);
        } else {
            console.log('zip created');
            var lastFile = result.zippedFiles[result.zippedFiles.length - 1];
            const signedUrlExpireSeconds = 60 * 20;
            const url = s3.getSignedUrl('getObject', {
                Bucket: destinationBucket,
                Key: destinationFolder + '.zip',
                Expires: signedUrlExpireSeconds
            });

            if (lastFile)
                console.log('last key ', lastFile.Key); // next time start from here
        }
    });

    //-----------Zip folder End----------------------// 
}

async function copyFromS3Bucket(s3Bucket, destinationBucket, folderName, destinationFolder) {
        const s3BucketListParams = {
            Bucket: s3Bucket,
            Prefix: folderName
        };

        const s3BucketListedObjects = await s3.listObjectsV2(s3BucketListParams).promise();

        if (s3BucketListedObjects.Contents.length === 0) return;

        var contents = s3BucketListedObjects.Contents;

        for (let i = 0; i < contents.length; i++) {
            var params = {
                Bucket: destinationBucket,
                CopySource: s3Bucket + "/" + folderName + contents[i]['Key'],
                Key: destinationFolder + "/" + contents[i]['Key']
            };
            try {
                await s3.copyObject(params).promise();
            } catch (err) {
                console.log("error copying " + s3Bucket + "/" + folderName + contents[i]['Key'], err);
                }
            };

            createZip(destinationBucket, destinationFolder);
        }