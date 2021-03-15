# Lambda Deployment

This Project defines, custom lambdas build and deploy using Cloud Formation templates in the same branch.

## Prerequisites
1. The Lambda Folder names should be started with the same pattern. In this project, I've used `lambda-` as the pattern.
2. Need an S3 Bucket with Versioning Enabled. (Versioning requires for Lambda update.
3. AWS IAM user with Required Privileges for Lamdba Invocation, Versioning, Alias, and Cloudformation. 

## Features:
1. Builds only the modified lambda and not all the lambdas
2. You can have a custom Lambda Function name rather than the name provided by CloudFormation Template provided.
3. Auto Versioning of a lambda deployed.
4. Auto Alias assigned to the deployed lambda version
5. You can add cross Lambda Functions (NodeJS, Python, etc)
6. you can append lambda functions later after CF Stack creation as well.

## Installation

```bash
./run.sh
```
The Above Installation does the following:
1. Cleanup the existing build artifacts
2. Builds the affected lambdas
3. Uploads the affected lambda artifacts to an S3 bucket
4. deploys the Lambdas using CloudFormation stack

## Configuration

* `devops/scripts/.env` - Environment Related properties are available. An important thing to note here is to set the `OPERATION=create` when you are creating a brand new CF Stack. 
* Note: Change the option to `OPERATION=update` for further updates.
* `devops/cloudformation/lambdas-template.yaml` is the lambdas yaml file configuration.

## Repositories
[Lambda Source](https://github.com/ssankarau/lambda-deploy)
