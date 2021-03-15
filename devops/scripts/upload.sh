#!/bin/bash

CI_PROJECT_DIR=$1

echo "S3 Bucket Name: ${S3_BUCKET}"

# #Upload Artifacts to S3
echo "Uploading Artifacts"
aws s3 cp "${CI_PROJECT_DIR}/artifacts/" "s3://${S3_BUCKET}/" --recursive

cp -f "${CI_PROJECT_DIR}/devops/cloudformation/lambdas-version.yaml" "${CI_PROJECT_DIR}/devops/cloudformation/lambdas.yaml"


# Update Lambda S3 Version in CF Template
cd "${CI_PROJECT_DIR}" || exit

#lambdas_list=$( ls -d */ | grep "lambda-" | cut -d / -f1 )
lambdas_list=$( ls -d lambda-* )
for lambda in ${lambdas_list[@]};
do
    VERSION_ID=$(aws s3api put-object-tagging --bucket "${S3_BUCKET}" --key "lambdas/${lambda}.zip" --tagging 'TagSet=[{Key=lambda,Value=getVersion}]' --output text)
    echo "$lambda : $VERSION_ID"
    sed -i "s/<${lambda}-s3-version>/${VERSION_ID}/g" "${CI_PROJECT_DIR}/devops/cloudformation/lambdas.yaml"
done;

# echo "Uploading cloudformation files"
# aws s3 cp "${CI_PROJECT_DIR}/devops/cloudformation/" "s3://${S3_BUCKET}/" --recursive
