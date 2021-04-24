#!/bin/bash

WORKSPACE=$( pwd )

# . "${WORKSPACE}/.env"
. "${WORKSPACE}/devops/scripts/.env"

echo "Work space :--- ${WORKSPACE}"

#Ignore Other Folders to Ignore During Build.
ignore_list=("devops")

if [ -z "$STAGE" ]
then
      echo "WARNING: \$STAGE is not defined. Setting it to dev"
      STAGE=dev
fi


echo ${STACK_NAME}
echo ${BUCKET}

# make a build directory to store artifacts
rm -rf build
mkdir build

# make the deployment bucket in case it doesn't exist
aws s3 mb s3://$BUCKET 

# generate next stage yaml file
aws cloudformation package --template-file $WORKSPACE/devops/cloudformation/lambdas-version.yaml --output-template-file build/output.yaml --s3-bucket $BUCKET                      
aws cloudformation deploy --template-file build/output.yaml --stack-name $STACK_NAME --capabilities CAPABILITY_IAM --parameter-overrides STAGE=$STAGE





# sam package --template-file $WORKSPACE/devops/cloudformation/lambdas-version.yaml --s3-bucket $BUCKET --output-template-file build/output.yaml

# sam deploy --template-file build/output.yaml --capabilities CAPABILITY_IAM --stack-name $STACK_NAME --region $REGION --parameter-overrides STAGE=$STAGE
