var AWS = require('aws-sdk');
var http = require('http');
var s3;
var apiResult;
var ssm = new AWS.SSM();
var envPath = process.env.ssm_store;
var environment = {};
var patinetDataBucket;

exports.handler = (event, context, callback) => {
    
    var envReq = getParameterFromSystemManager();
    
    envReq.then(() => {
        patinetDataBucket = environment['envprefix'] + '-lenssendpatientdata';
        AWS.config.update({ 
            region: 'us-east-1' });
        s3 = new AWS.S3({ apiVersion: '2006-03-01' });
        
        console.log(event);
        
        var foldername = event['gpid'] + Date.now();
        console.log('foldername--', foldername);
        var path = '/patient/procedure/contact/' + event['gpid'];
        var tokenId = event['tokenid'];
        var userName = event['username'];
        var ownerId = event['ownerId'];
        console.log(event);
        let headers = {
            'Content-Type': 'application/json',
            'Authorization': tokenId,
            'surgeonid': userName
        };
        if (ownerId) {
            headers['ownerid'] = ownerId;
        }
        const options = {
            host: environment['API_host'],
            port: environment['API_port'],
            path: path,
            method: 'GET',
            headers: headers
        };
        console.log('options----', options);
        const req = http.request(options, (res) => {
            console.log('Web service called and response code--', res.statusCode);
            if (res.statusCode == 200) {
                var str = '';
                res.on('data', function (chunk) {
                    str += chunk;
                    apiResult = JSON.parse(str);

                    var srcBucket = environment['envprefix'] + '-lensmediabucket';
                    var destBucket = patinetDataBucket;
                    var patientJson = {};
                    var imageArray = [];
                    let imageObj = {};
                    var videoArray = [];
                    let videoObj = {};
                    var docArray = [];
                    let docObj = {};

                    patientJson['patientname'] = event['patientname'];
                    // patientJson.push("patientname" + ' : ' + event['patientname']);

                    var imageList = event['images'];
                    imageList.forEach(function (imagePath) { // For copying the images to images foder from source folder
                        imageObj = {};
                        imageObj['name'] = imagePath.name;
                        imageObj['preferredName'] = imagePath.preferredName;
                        console.log('#### Image Path ',imagePath.fileUrl);
                        var source = srcBucket + '/' + imagePath.fileUrl;
                        console.log('Actual Image source Path--', source);
                        var destination = destBucket + '/' + foldername + '/' + 'images';
                        console.log('Actual Image destination Path--', source);
                        console.log('Actual Image key----' + getKey(imagePath.fileUrl));
                        imageObj['fileUrl'] = destination + '/' + getKey(imagePath.fileUrl);
                        imageArray.push(imageObj);
                        copyObject(source, destination, getKey(imagePath.fileUrl));
                        var sourceThumbnail = srcBucket + '/' + getImageThumbnailPath(imagePath.fileUrl);
                        console.log('Thumbnail Image source Path--', source);
                        var destinationThumbnail = destBucket + '/' + foldername + '/' + 'images';
                        console.log('Thumbnail Image destination Path--', source);
                        console.log('Thumbnail Image Key--', getKey(getImageThumbnailPath(imagePath.fileUrl)));
                        copyObject(sourceThumbnail, destinationThumbnail, getKey(getImageThumbnailPath(imagePath.fileUrl)));

                    });

                    patientJson['images'] = imageArray;
                    // patientJson.push("images" + ' : ' + '[' + imageArray + ']');

                    console.log(JSON.stringify(patientJson));
                    var videoList = event['videos'];
                    videoList.forEach(function (videoPath) {// For copying the videos to videos foder from source folder
                        videoObj = {};
                        videoObj['name'] = videoPath.name;
                        videoObj['preferredName'] = videoPath.preferredName;
                        var source = srcBucket + '/' + videoPath.fileUrl;
                        console.log('Actual Video source Path--', source);
                        var destination = destBucket + '/' + foldername + '/' + 'videos';
                        console.log('Actual Video destination Path--', source);
                        console.log('Actual Video key----' + getKey(videoPath.fileUrl));
                        videoObj['fileUrl'] = destination + '/' + getKey(videoPath.fileUrl);
                        videoArray.push(videoObj);
                        copyObject(source, destination, getKey(videoPath.fileUrl));
                        var sourceThumbnail = srcBucket + '/' + getVideoThumbnailPath(videoPath.fileUrl);
                        console.log('Thumbnail Video source Path--', source);
                        var destinationThumbnail = destBucket + '/' + foldername + '/' + 'videos';
                        console.log('Thumbnail Video destination Path--', source);
                        console.log('Thumbnail Video key----' + getKey(getVideoThumbnailPath(videoPath.fileUrl)));
                        copyObject(sourceThumbnail, destinationThumbnail, getKey(getVideoThumbnailPath(videoPath.fileUrl)));

                    });

                    patientJson['videos'] = videoArray;
                    // patientJson.push("videos" + ' : ' + '[' + videoArray + ']');
                    console.log(JSON.stringify(patientJson));
                    var docList = event['patientreports'];
                    docList.forEach(function (docPath) {
                        docObj = {};
                        docObj['name'] = docPath.name;
                        docObj['preferredName'] = docPath.preferredName;
                        var source = srcBucket + '/' + docPath.fileUrl;
                        var destination = destBucket + '/' + foldername + '/' + 'sharabledocs';
                        docObj['fileUrl'] = destination + '/' + getKey(docPath.fileUrl);
                        docArray.push(docObj);
                        copyObject(source, destination, getKey(docPath.fileUrl));
                    });

                    patientJson['patientreports'] = docArray;
                    // patientJson.push("patientreports" + ' : ' + '[' + docArray + ']');
                    
                    console.log(JSON.stringify(patientJson));
                    createPatienttxt(foldername, patientJson);

                    var apiResponse = {
                        'foldername': foldername,
                        'email': apiResult.email,
                        'mobile': apiResult.phonenumber,
                    };
                    console.log(apiResponse);

                    callback(null, apiResponse);

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
    }).catch((err) => {
        console.log('GetSSMParam-error', err);
    });

};


function copyObject(source, destination, destKey) {
    s3.copyObject({
        CopySource: source,
        Bucket: destination,
        Key: destKey,
        Tagging: "DeleteTag=Delete"
    }, function (copyErr, copyData) {
        if (copyErr) {
            console.log("Error in copying images--", source);
        } else {
            console.log('Copied images--' + destKey);

        }
    });

}

function getKey(objectPath) {
    var lastSpecialPosition = objectPath.lastIndexOf("/");
    var destKey = objectPath.substring(lastSpecialPosition + 1, objectPath.length);
    return destKey;
}

function getImageThumbnailPath(objectPath) {
    var lastSpecialPosition = objectPath.lastIndexOf("/");
    return objectPath.substring(0, lastSpecialPosition) + '/Thumb_' + objectPath.substring(lastSpecialPosition + 1, objectPath.length);
}

function getVideoThumbnailPath(objectPath) {
    var lastSpecialPosition = objectPath.lastIndexOf("/");
    var videothumbPath = objectPath.substring(0, lastSpecialPosition) + '/Thumb_' + objectPath.substring(lastSpecialPosition + 1, objectPath.length);
    var lastDotPosition = videothumbPath.lastIndexOf(".");
    var pathAfterRemovingExtention = videothumbPath.replace(videothumbPath.substring(lastDotPosition + 1, videothumbPath.length), '');
    return pathAfterRemovingExtention + 'jpg';

}

function createPatienttxt(foldername, patientJson) {
    var myKey = foldername + '/patientinfo.json';
    var params = { Bucket: patinetDataBucket, Key: myKey, Body: JSON.stringify(patientJson) };

    s3.putObject(params, function (err, data) {

        if (err) {
            console.log(err);
        } else {
            console.log("Successfully created patient text file-", myKey);

        }
    });

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