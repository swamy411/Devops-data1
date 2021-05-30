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
        this.updatedFileSize = [];
        this.tempFile = undefined;
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

    async updateFileSizeFile() {
        console.log('### updateFileSizeFile updated file size obj ', this.updatedFileSize);
        let convertJsonToCSV = this.updatedFileSize;
        var options = {
            headers : "GPID,fileSize,mediaType,MIC_userName"
          };
        const convertedCSV = this.csvJson.toCSV(convertJsonToCSV, options);
        let [month, date, year] = new Date().toLocaleDateString("en-US").split("/");
        if (month < 10) {
            month = '0'+month;
        }
        const sizeDate = month+date+year;
        const fileName = 'cloud_storage_gpid_size_'+sizeDate+'.csv';
        const filePath = this.path.join('/tmp', fileName);
        const tempFile = this.fs.createWriteStream( this.filePath);
        this.fs.writeFile(filePath, convertedCSV, 'utf8', (errUpdatedFileSize, dataUpdatedFileSize) => {
            if (errUpdatedFileSize) {
                console.log('error ',errUpdatedFileSize);                
            } else {
                console.log('writefile updated CSV data ', dataUpdatedFileSize);
                const inputFileBucket = this.event.inputFileBucket || '';
                const inputFilePath = fileName;
                let putObjParam = {
                    Body: fs.createReadStream(filePath),
                    Bucket: inputFileBucket,
                    Key: inputFilePath
                  }
                  this.s3Obj.putObject(putObjParam, (error) => {
                    if (error) {
                      console.log('Error uploading updated CSV file');
                    } else {
                      console.log('Updated file size uploaded back to S3');
                    }
                });
            }
        });
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
        console.log('convertCSV', this.filePath, 'file stream ', this.tempFile);
        await this.fs.readFile(this.filePath, 'utf-8', (err, fileContent) => {
            console.log('error ',err, ' file content ', fileContent);
            if(err) {
                console.log(err); // Do something to handle the error or just throw it
                throw new Error(err);
            }
            const jsonObj = this.csvJson.toObject(fileContent);
            console.log('JSONs length ',jsonObj.length);
            
            let calculatedPromiseArr = jsonObj.map((eachItem) => {
                console.log('json object index ', ' json length ', jsonObj.length);
                let isDeviceBlob, key, gpId, surgeonName, archiveObjectStatus, fileSize;
                let archiveProcedureStatus, terminationStatus, subscriptionStatus, mediaType;
                let originalFileSize;
                console.log('filePathforeach ',eachItem['annotationfilepath']);
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
                
                
                

                let bucketName = this.lensMediaBucket;
                if (archiveObjectStatus == '0') {
                    bucketName = this.archiveObject;
                } else if (archiveProcedureStatus == '2') {
                    bucketName = this.archiveProcedure;
                } else if (terminationStatus == '1' && subscriptionStatus == '3') {
                    bucketName = this.terminationSubscription;
                }
                // This checks original file size has value zero in database
                return this.getFileSize(key, bucketName).then((response) => {
                    fileSize = response.ContentLength || 0;
                    let actualFileSize = {}
                    eachItem['annotationfilesize'] = fileSize;
                    actualFileSize['GPID'] = eachItem['patientprocedureid'];
                    actualFileSize['fileSize'] = fileSize;
                    actualFileSize['mediaType'] = eachItem['MediaType'];
                    actualFileSize['MIC_userName'] = eachItem['cognitouser_username'];
                    console.log('### updated file size ', actualFileSize);
                    this.updatedFileSize.push(actualFileSize);
                    console.log('## 2 inside if file size ', this.updatedFileSize);
                    return response;   
                },
                (error) => {
                    console.log('Error get file size head call ', error);
                    let actualFileSizeErr = {};
                    actualFileSizeErr['GPID'] = eachItem['patientprocedureid'];
                    actualFileSizeErr['fileSize'] = fileSize;
                    actualFileSizeErr['mediaType'] = eachItem['MediaType'];
                    actualFileSizeErr['MIC_userName'] = eachItem['cognitouser_username'];
                    this.updatedFileSize.push(actualFileSizeErr);
                    return error;
                });  
                
            });
            const that = this;
            Promise.all(calculatedPromiseArr).then((resultArray)=> {
                console.log('Result array');
                that.updateFileSizeFile();
            }).catch((err) =>{
                console.log('promise all catch function ', err);
            })
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

    getFileSize(filePath, bucketName) {
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
