#!/bin/bash
# Notifies Bing/Yandex via IndexNow that pages changed, for near-instant re-indexing.
# Usage: ./scripts/indexnow-submit.sh
set -e

KEY="618747a2b5d6859bdcb51eb56b9eae8a"
HOST="www.casadecampow.com"

curl -s -X POST "https://api.indexnow.org/indexnow" \
  -H "Content-Type: application/json" \
  -d "{
  \"host\": \"$HOST\",
  \"key\": \"$KEY\",
  \"keyLocation\": \"https://$HOST/$KEY.txt\",
  \"urlList\": [
    \"https://$HOST/\",
    \"https://$HOST/bodas.html\",
    \"https://$HOST/corporativo.html\",
    \"https://$HOST/integracion.html\",
    \"https://$HOST/conciertos.html\",
    \"https://$HOST/ferias.html\",
    \"https://$HOST/galeria.html\",
    \"https://$HOST/faq.html\",
    \"https://$HOST/contacto.html\",
    \"https://$HOST/historias.html\",
    \"https://$HOST/privacidad.html\"
  ]
}" -w "\nHTTP status: %{http_code}\n"
