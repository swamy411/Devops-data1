const csvJson = require('csvjson');
const fs = require('fs');
const aws = require('aws-sdk');
const http = require('http');
const path = require('path');


//Lambda entry point
exports.handler = (event, context, callback) => {
    const migrationObj = new UpdateFileSize(
        event,
        context,
        callback,
        csvJson,
        fs,
        aws,
        http,
        path,
        process.env.ssm_store
    );
    migrationObj.handler();
};

class UpdateFileSize {
    constructor(
        event,
        context,
        callback,
        csvJson,
        fs,
        aws,
        http,
        path,
        envPath
    ) {
        this.event = event;
        this.context = context;
        this.callback = callback;
        this.csvJson = csvJson;
        this.fs = fs;
        this.envPath = envPath;
        this.environment = {};
        this.metaData = undefined;
        this.s3Obj = new aws.S3();
        this.ssm = new aws.SSM();
        this.http = http;
        this.path = path;
        console.log(' this.envPath ',  this.envPath);
        this.filePath = './dev_filepath_filesize.csv';
        this.archiveObject = '';
        this.lensMediaBucket = '';
        this.archiveProcedure = '';
        this.terminationSubscription = '';
        this.errorUpdateFileSize = 'Eror updating file size';
        this.errorGetFileSize = 'Error in getting file size';
        console.log('inside constructor');
      }

    async fetchParameterStore() {
        console.log('fetchParameterStore');
        await this.getParameterFromSystemManager().then(async(result) => {
            console.log('inside param success ', result);
            this.archiveObject =  this.environment['envprefix'] + '-lensarchiveobjects';
            this.lensMediaBucket =  this.environment['envprefix'] + '-lensmediabucket';
            this.archiveProcedure =  this.environment['envprefix'] + '-patientprocedure-archive';
            this.terminationSubscription =  this.environment['envprefix'] + '-terminationsubscriptionbucket';
            await this.fetchSignedUrl();
            // await this.convertCSV();
        })
        .catch((ssmError) => {
            console.log('ssm error ',ssmError);
        });
    }
    
    async fetchFile() {
        const inputFileBucket = this.event.inputFileBucket || '';
        const inputFilePath = this.event.filePath || '';
        let params = {   Bucket: inputFileBucket,   Key: inputFilePath };
        return this.s3Obj.getObject(params).createReadStream();
    }

    async fetchSignedUrl() {
        return new Promise((resolve, reject) => {
            console.log('fetch signed url');
            this.filePath = this.path.join('/tmp', 'filesize.csv');
            const tempFile = this.fs.createWriteStream( this.filePath);
            const inputFileBucket = this.event.inputFileBucket || '';
            const inputFilePath = this.event.filePath || '';
            let params = {   Bucket: inputFileBucket,   Key: inputFilePath };
            console.log('##params ', params);
           
            let data = this.s3Obj.getObject(params).promise();
            data.then((response) => {
                console.log('response ', response);
                this.fs.writeFile(this.filePath, response.Body, 'utf8', (err, data) => {
                    if (err) {
                        console.log('error ',err);
                        reject(false);
                    } else {
                        console.log('writefile data ', data);
                        this.convertCSV();
                        resolve(true);
                    }
                });
            },
            (error) => {
                console.log('error ', error);
            });
        });
        
        
    }

    async convertCSV() {
        console.log('convertCSV ', this.filePath);
        await this.fs.readFile(this.filePath, 'utf-8', (err, fileContent) => {
            console.log('error ',err, ' file content ', fileContent);
            if(err) {
                console.log(err); // Do something to handle the error or just throw it
                throw new Error(err);
            }
            const jsonObj = this.csvJson.toObject(fileContent);
            // console.log(jsonObj);
            jsonObj.forEach(async(eachItem) => {
                let isDeviceBlob, key, gpId, mediaId, localMediaId, annotationId, surgeonName, archiveObjectStatus, fileSize;
                let archiveProcedureStatus, terminationStatus, subscriptionStatus, mediaType;
                let bodyStringforMedia, bodyStringforGlobalAnnotation, bodyStringforLocalAnnotation, headers;
                let apipath, bodyString, options, originalFileSize;
                console.log('filePath ',eachItem['annotationfilepath']);
                isDeviceBlob =  undefined;
                key = eachItem['annotationfilepath'];
                gpId = eachItem['patientprocedureid'];               
                surgeonName = eachItem['cognitouser_username'];
                archiveObjectStatus = eachItem['isactive'];
                archiveProcedureStatus = eachItem['ProcedureStatus'];
                terminationStatus = eachItem['terminationaction'];
                subscriptionStatus = eachItem['subscriptionstatus'];
                originalFileSize = eachItem['annotationfilesize'];
                mediaType = eachItem['MediaType'];
                console.log('###Media Type ', mediaType);
                if (mediaType == 'Global' ) {
                    annotationId = eachItem['appannotationid'];
                    apipath = '/patient/procedure/annotation/global';
                } else if (mediaType == 'Media') {
                    mediaId = eachItem['appannotationid'];
                    apipath = '/patient/procedure/media';
                } else if (mediaType == 'Local') {
                    annotationId = eachItem['appannotationid'];
                    localMediaId = eachItem['mediaid'];
                    apipath = '/patient/procedure/annotation/local';
                }
                
                

                let bucketName = this.lensMediaBucket;
                if (archiveObjectStatus == '0') {
                    bucketName = this.archiveObject;
                } else if (archiveProcedureStatus == '2') {
                    bucketName = this.archiveProcedure;
                } else if (terminationStatus == '1' && subscriptionStatus == '3') {
                    bucketName = this.terminationSubscription;
                }
                // This checks original file size has value zero in database
                if (key != 'NULL' && originalFileSize == '0') {
                    await this.getFileSize(key, bucketName).then(async(response) => {
                    fileSize = response.ContentLength || 0;
                    console.log('inside then getflsz ', response.ContentLength, ' for key ', key, ' bucketname ', bucketName);
                    isDeviceBlob = response.Metadata['isdeviceblob'];
                    bodyStringforMedia = JSON.stringify({
                        'gpid': gpId,
                        'mediaid': mediaId,
                        'mediafilepath': key,
                        'filesize': fileSize,
                        'surgeonname': surgeonName
                    });
                    
                    bodyStringforGlobalAnnotation = JSON.stringify({
                        'gpid': gpId,
                        'annotationid': annotationId,
                        'annotationfilepath': key,
                        'filesize': fileSize,
                        'surgeonname': surgeonName
                    });
                    
                    bodyStringforLocalAnnotation = JSON.stringify({
                        'gpid': gpId,
                        'mediaid': localMediaId,
                        'annotationid': annotationId,
                        'annotationfilepath': key,
                        'filesize': fileSize,
                        'surgeonname': surgeonName
                    });
                    if(mediaType == 'Media'){
                       bodyString = bodyStringforMedia;
                   } else if(mediaType == 'Global'){
                       bodyString = bodyStringforGlobalAnnotation;
                   } else if(mediaType == 'Local'){
                       bodyString = bodyStringforLocalAnnotation;
                   } 
                   console.log('### Api path ', apipath);
                    
                   
                    headers = {
                        'Content-Type': 'application/json',
                        'Content-Length': bodyString.length,
                        'Actor' : surgeonName,
                        'lambda': '#1234lambd@_tr1gger4321#'
                    };
                    if(apipath) {
                        options = {
                            host: this.environment['API_host'],
                            path: apipath,
                            port: this.environment['API_port'],
                            method: 'PUT',
                            headers: headers
                        };
                        await this.updateFileSize(options, bodyString).then((response) => {
                            console.log('update file size thenable ', response);
                        },
                        (error) => {
                            console.log('Error update ', error);
                            // return this.callback(new Error(this.errorUpdateFileSize));
                        });
                    } else {
                        return this.callback(new Error('api path issue'));
                    }
                },
                (error) => {
                    console.log('Error get file size head call ', error);
                //   return  this.callback(new Error(this.errorGetFileSize));
                });  
                } else {
                    const errorUpdate = 'failed to update file size for ' + key +
                        ' for surgeon ' + surgeonName + ' for media/annotationid '+eachItem['appannotationid'];
                    console.log(errorUpdate);
                }
                             
            });
        });
    }

    async updateFileSize(params, bodyString) {
        console.log('updateFileSize')
        return new Promise((resolve, reject) => {
            
            let req = this.http.request(params, function(res) {
                // reject on bad status
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error('statusCode=' + res.statusCode));
                }
                // cumulate data
                let body = [];
                res.on('data', (chunk) => {
                    body.push(chunk);
                });
                // resolve on end
                res.on('end', () => {
                    try {
                        body = JSON.parse(Buffer.concat(body).toString());
                        console.log(' res end update file size ', body, ' for this object ', bodyString, ' for api path ',params.path);
                    } catch(e) {
                        console.log('update flsz error ', e);
                        reject(e);
                    }
                    resolve(body);
                });
            });
            // reject on request error
            req.on('error', function(err) {
                // This is not a "Second reject", just a different sort of failure
                reject(err);
            });
            if (bodyString) {
                req.write(bodyString);
            }
            // IMPORTANT
            req.end();
        }); 
    }

    async getFileSize(filePath, bucketName) {
        return new Promise((resolve, reject) => { 
                let key = filePath;
                let params = {
                    Bucket: bucketName,
                    Key: key
                };
                this.s3Obj.headObject(params, (err, data) => {
                    if (err) {
                        var error_message = 'Error in getting  metadata for bucket: ' + bucketName
                            + ', key: ' + key + ', Error: ' + err;
                        console.error(error_message);
                        reject(err);
                        // this.callback(error_message);
                    } else {                        
                        console.log('Complete data ' + key);
                        resolve(data);                    
                    }
                });
            });       
        // Fetch
    }

    async getParameterFromSystemManager() {
        return new Promise((resolve, reject) => {
            var params = {
                Path: this.envPath,
                /* required */
                WithDecryption: false,
                Recursive: true
            };
            this.ssm.getParametersByPath(params, (err, data) => {
                if (err) {// an error occurred
                    reject(false);
                }
                else {// successful response
                    let dataEnv = data.Parameters ? data.Parameters : [];
                    let env = {};
                    dataEnv.forEach((eachItem) => {
                        let key = eachItem.Name;
                        key = key.replace(this.envPath , '');
                        key = key.replace('/', '_');
                        env[key] = eachItem.Value;
                    });
                    this.environment = env;
                    resolve(true);
                }
            });
        });
    }

    async handler(event) {
        await this.fetchParameterStore();
        // return this.context.done;
    }

}
