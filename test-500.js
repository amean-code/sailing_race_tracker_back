const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');
db.serialize(() => {
  db.all("SELECT id, email, role FROM user", (err, rows) => {
    console.log(rows);
  });
});
