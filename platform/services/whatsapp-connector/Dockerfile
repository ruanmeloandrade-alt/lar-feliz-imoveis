# Saúde Slim | Serviço WhatsApp Web
# Mesmo método de deploy usado na Harpia:
# Railway -> GitHub -> Root Directory /services/whatsapp-connector -> Dockerfile
# A Saúde Slim integra com Evolution API, portanto usamos o runtime Evolution
# isolado neste serviço, sem importar código, credenciais ou banco da Harpia.
FROM evoapicloud/evolution-api:v2.3.7

EXPOSE 8080
