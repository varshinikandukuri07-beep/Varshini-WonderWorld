
const express = require("express");
const mysql = require("mysql8");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static("online-travel_public"));

// DATABASE CONNECTION
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "pandu",
    database: "online_travel"
});

db.connect((err) => {
    if (err) {
        console.log(err);
        return;
    }

    console.log("MySQL Connected Successfully");
});

// TABLE NAME ALIASES
const tableNames = {
    customers: ["customers", "customer"],
    destinations: ["destinations", "destination"],
    package: ["package", "packages", "travel_package", "travel_packages"],
    bookings: ["bookings", "booking"]
};

// COLUMN NAME NORMALIZATION
function normalize(name) {
    return name.toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .replace(/s(?=_|$)/g, "");
}

// FIND ACTUAL TABLE NAME
function getTable(table, callback) {

    if (!tableNames[table]) {
        return callback(new Error("Invalid table name"));
    }

    db.query("SHOW TABLES", (err, result) => {

        if (err) return callback(err);

        const existingTables = result.map(row => Object.values(row)[0]);

        const actualTable = existingTables.find(name =>
            tableNames[table].some(alias =>
                name.toLowerCase() === alias.toLowerCase()
            )
        );

        if (!actualTable) {
            return callback(new Error(
                "Table not found. Existing tables: " + existingTables.join(", ")
            ));
        }

        callback(null, actualTable);
    });
}

// GET TABLE COLUMNS
function getColumns(table, callback) {

    db.query(`SHOW COLUMNS FROM \`${table}\``, (err, result) => {

        if (err) return callback(err);

        callback(null, result);
    });
}

// GET PRIMARY KEY
function getPrimaryKey(table, callback) {

    db.query(
        `SHOW KEYS FROM \`${table}\` WHERE Key_name = 'PRIMARY'`,
        (err, result) => {

            if (err) return callback(err);

            if (result.length === 0) {
                return callback(new Error("Primary key not found"));
            }

            callback(null, result[0].Column_name);
        }
    );
}

// MAP FRONTEND FIELDS TO MYSQL COLUMNS
function mapData(data, columns, callback) {

    const mapped = {};

    for (let key of Object.keys(data)) {

        const column = columns.find(col =>
            normalize(col.Field) === normalize(key)
        );

        if (!column) {
            return callback(new Error("Column not found: " + key));
        }

        if (data[key] !== "") {
            mapped[column.Field] = data[key];
        }
    }

    callback(null, mapped);
}

// HOME PAGE
app.get("/", (req, res) => {

    res.sendFile(__dirname + "/online-travel_public/index.html");

});

// INSERT RECORD
app.post("/:table", (req, res) => {

    getTable(req.params.table, (err, table) => {

        if (err) return res.status(400).send(err.message);

        getColumns(table, (err, columns) => {

            if (err) return res.status(500).send(err.message);

            mapData(req.body, columns, (err, data) => {

                if (err) return res.status(400).send(err.message);

                const names = Object.keys(data);

                if (names.length === 0) {
                    return res.status(400).send("Enter record details");
                }

                const values = Object.values(data);

                const sql = `INSERT INTO \`${table}\`
                (${names.map(c => `\`${c}\``).join(",")})
                VALUES (${names.map(() => "?").join(",")})`;

                db.query(sql, values, (err, result) => {

                    if (err) return res.status(500).send(err.message);

                    res.send("Record Inserted Successfully");

                });

            });

        });

    });

});

// DISPLAY ALL RECORDS
app.get("/:table", (req, res) => {

    getTable(req.params.table, (err, table) => {

        if (err) return res.status(400).send(err.message);

        db.query(`SELECT * FROM \`${table}\``, (err, result) => {

            if (err) return res.status(500).send(err.message);

            res.json(result);

        });

    });

});

// SEARCH RECORD BY ID
app.get("/:table/:id", (req, res) => {

    getTable(req.params.table, (err, table) => {

        if (err) return res.status(400).send(err.message);

        getPrimaryKey(table, (err, idColumn) => {

            if (err) return res.status(500).send(err.message);

            db.query(
                `SELECT * FROM \`${table}\` WHERE \`${idColumn}\` = ?`,
                [req.params.id],
                (err, result) => {

                    if (err) return res.status(500).send(err.message);

                    res.json(result);

                }
            );

        });

    });

});

// UPDATE RECORD
app.put("/:table/:id", (req, res) => {

    getTable(req.params.table, (err, table) => {

        if (err) return res.status(400).send(err.message);

        getColumns(table, (err, columns) => {

            if (err) return res.status(500).send(err.message);

            getPrimaryKey(table, (err, idColumn) => {

                if (err) return res.status(500).send(err.message);

                mapData(req.body, columns, (err, data) => {

                    if (err) return res.status(400).send(err.message);

                    delete data[idColumn];

                    const names = Object.keys(data);

                    if (names.length === 0) {
                        return res.status(400).send("No fields to update");
                    }

                    const sql = `UPDATE \`${table}\` SET
                    ${names.map(c => `\`${c}\` = ?`).join(",")}
                    WHERE \`${idColumn}\` = ?`;

                    db.query(
                        sql,
                        [...Object.values(data), req.params.id],
                        (err, result) => {

                            if (err) return res.status(500).send(err.message);

                            if (result.affectedRows === 0) {
                                return res.send("Record not found");
                            }

                            res.send("Record Updated Successfully");

                        }
                    );

                });

            });

        });

    });

});

// DELETE RECORD
app.delete("/:table/:id", (req, res) => {

    getTable(req.params.table, (err, table) => {

        if (err) return res.status(400).send(err.message);

        getPrimaryKey(table, (err, idColumn) => {

            if (err) return res.status(500).send(err.message);

            db.query(
                `DELETE FROM \`${table}\` WHERE \`${idColumn}\` = ?`,
                [req.params.id],
                (err, result) => {

                    if (err) return res.status(500).send(err.message);

                    if (result.affectedRows === 0) {
                        return res.send("Record not found");
                    }

                    res.send("Record Deleted Successfully");

                }
            );

        });

    });

});

// START SERVER
app.listen(3005, () => {

    console.log("Server running at http://localhost:3005");

});