#!/bin/bash

# Kysytään projektin nimeä
read -p "Mikä on projektin nimi GitHubissa? " PROJEKTIN_NIMI

# Alustetaan git jos sitä ei ole
if [ ! -d .git ]; then
    git init
    git branch -M main
fi

# Lisätään kaikki tiedostot
git add .

# Tehdään commit
read -p "Mitä muutoksia teit? (commit-viesti): " VIESTI
git commit -m "$VIESTI"

# Luodaan repositorio GitHubiin
# --public tai --private (valitse kumpi haluat)
gh repo create "$PROJEKTIN_NIMI" --public --source=. --push

echo "Valmis! Projekti on GitHubissa osoitteessa github.com/sinun-kayttajatunnus/$PROJEKTIN_NIMI"