#!/bin/bash

CI_PROJECT_DIR=$1

echo "S3 Bucket Name: ${S3_BUCKET}"

# #Upload Artifacts to S3
echo "Uploading Artifacts"
#aws s3 cp "${CI_PROJECT_DIR}/artifacts/" "s3://${S3_BUCKET}/" --recursiv
"C:\Program Files\Amazon\AWSCLIV2\aws.exe" s3 cp "${CI_PROJECT_DIR}/artifacts/" "s3://${S3_BUCKET}/" --recursive

cp -f "${CI_PROJECT_DIR}/devops/cloudformation/lambdas-version.yaml" "${CI_PROJECT_DIR}/devops/cloudformation/lambdas.yaml"

sed -i "s/ENV/${STAGE}/g" "${CI_PROJECT_DIR}/devops/cloudformation/lambdas.yaml"

echo "Fetching Lambda Layer version for ffmpeg"
Layer_Arn=$("C:\Program Files\Amazon\AWSCLIV2\aws.exe" lambda list-layer-versions --layer-name ffmpeg_custom_layer --query LayerVersions[0].LayerVersionArn)

echo "Layer Arn : ${Layer_Arn}"
sed -i "s/ffmpeg_custom_layer_arn/${Layer_Arn}/g" "${CI_PROJECT_DIR}/devops/cloudformation/lambdas.yaml"

# Update Lambda S3 Version in CF Template
echo "uploading script-.--............"
cd "${CI_PROJECT_DIR}/lambda_functions" || exit
echo $(pwd)
echo $(ls)
#lambdas_list=$( ls -d */ | grep "lambda-" | cut -d / -f1 )
lambdas_list=$( ls )
for lambda in ${lambdas_list[@]};
do
    VERSION_ID=$("C:\Program Files\Amazon\AWSCLIV2\aws.exe" s3api put-object-tagging --bucket "${S3_BUCKET}" --key "lambdas/${lambda}.zip" --tagging 'TagSet=[{Key=lambda,Value=getVersion}]' --output text)
    
    echo "$lambda : $VERSION_ID"
    sed -i "s/<${lambda}-s3-version>/${VERSION_ID}/g" "${CI_PROJECT_DIR}/devops/cloudformation/lambdas.yaml"
    
done;

echo $(cat "${CI_PROJECT_DIR}/devops/cloudformation/lambdas.yaml")
# echo "Uploading cloudformation files"
# aws s3 cp "${CI_PROJECT_DIR}/devops/cloudformation/" "s3://${S3_BUCKET}/" --recursive
