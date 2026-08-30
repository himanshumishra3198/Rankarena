#!/usr/bin/env bash
#
# Apply the ECR retention policy to the three deploy repositories.
#
# Every deploy pushes one image per service tagged with its commit sha and
# never reuses the tag, so the repositories grow without bound — they had
# reached 989 images and 36 GB before this existed. The policy is what keeps
# that in check on the registry side; the deploy workflow does the equivalent
# on the EC2 box.
#
# Safe to re-run: put-lifecycle-policy replaces the policy wholesale.
#
# Preview before applying (strongly recommended — expiry is irreversible):
#   ./scripts/apply-ecr-lifecycle.sh --preview
#
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
POLICY="$(dirname "$0")/ecr-lifecycle-policy.json"
REPOS=(rankarena-backend rankarena-frontend rankarena-admin)

if [[ "${1:-}" == "--preview" ]]; then
  for repo in "${REPOS[@]}"; do
    aws ecr start-lifecycle-policy-preview \
      --repository-name "$repo" --region "$REGION" \
      --lifecycle-policy-text "file://$POLICY" >/dev/null
  done
  echo "Preview started; results take a few seconds. Then:"
  for repo in "${REPOS[@]}"; do
    echo "  aws ecr get-lifecycle-policy-preview --repository-name $repo --region $REGION"
  done
  exit 0
fi

for repo in "${REPOS[@]}"; do
  aws ecr put-lifecycle-policy \
    --repository-name "$repo" --region "$REGION" \
    --lifecycle-policy-text "file://$POLICY" >/dev/null
  echo "Applied to $repo"
done

echo
echo "ECR evaluates a new policy within 24 hours, then continuously."
echo "Check progress with:  aws ecr describe-images --repository-name rankarena-backend --region $REGION --query 'length(imageDetails)'"
