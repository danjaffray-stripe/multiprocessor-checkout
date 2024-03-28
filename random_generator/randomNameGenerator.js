const fs = require('fs');
const readline = require('readline');
const path = require('path');

const loadAndCapitalizeNames = async (filePath) => {
  const names = [];
  const fileStream = fs.createReadStream(filePath);

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const capitalized = line.charAt(0).toUpperCase() + line.slice(1).toLowerCase();
    names.push(capitalized);
  }

  return names;
};

const commonEmailDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'];

const generateRandomNameAndEmail = async () => {

  const firstNames = await loadAndCapitalizeNames(path.join(__dirname, 'first-names.txt'));
  const lastNames = await loadAndCapitalizeNames(path.join(__dirname, 'first-names.txt'));

  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  const fullName = `${firstName} ${lastName}`;

  // Generate email
  const emailDomain = commonEmailDomains[Math.floor(Math.random() * commonEmailDomains.length)];
  const emailUserName = `${firstName.toLowerCase()}.${lastName.toLowerCase()}`;
  const email = `${emailUserName}@${emailDomain}`;

  return {  name: fullName, 
            email: email };
};

module.exports = generateRandomNameAndEmail;