const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;

// Middlewire
app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.voerh.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' });
        }
        req.decoded = decoded;
        next();
    });
}


async function run() {
    try {
        await client.connect();
        console.log('db connected');
        const servicesCollections = client.db('doctors_portal').collection('services');
        const bookingCollections = client.db('doctors_portal').collection('bookings');
        const userCollections = client.db('doctors_portal').collection('users');



        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = servicesCollections.find(query);
            const services = await cursor.toArray();
            res.send(services);
        });

        // laod users inforamtion on dashboard
        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollections.find().toArray();
            res.send(users);
        })

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollections.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin });
        })


        app.put('/user/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email;
            const requesterAccount = await userCollections.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                const filter = { email: email };
                const updateDoc = {
                    $set: { role: 'admin' },
                };
                const result = await userCollections.updateOne(filter, updateDoc);
                res.send(result);
            }
            else {
                res.status(403).send({ message: 'Forbidden' });
            }
        });

        // update user information api
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollections.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ result, token });
        });

        // Warning !!!!;
        // This is not proper way to query
        // After learning more about mongodb, use aggregate lookup, pipeline, match, group
        app.get('/available', async (req, res) => {
            const date = req.query.date;

            //step 1: get all services
            const services = await servicesCollections.find().toArray();

            // step 2: get the booking of that day. output: [{}, {}, {}, {}, {}]
            const query = { date: date };
            const bookings = await bookingCollections.find(query).toArray();

            // step 3: for each service ,
            services.forEach(service => {
                //step 4: find bookins for that service output: [{}, {}, {}]
                const serviceBookings = bookings.filter(book => book.treatment === service.name);
                //step 5: select slots for the service bookings: ['', '', '', '']
                const bookedSlots = serviceBookings.map(book => book.slot);
                // step 6: select those slots are not in bookedSlots
                const available = service.slots.filter(slot => !bookedSlots.includes(slot));
                //step 7: set available to slots to make it easier
                service.slots = available;

            })

            res.send(services);
        })

        /**
         * API Naming Convention
         * app.get('/booking') // get all bookings in this collection
         * app.get('/booking/:id') // get a specific booking 
         * app.post('/booking') // add a new booking
         * app.patch('/booking/:id') 
         * app.put('/booking/:id')  //update(if exists) upsert or insert (if doesn't exist)
         * app.delete('/booking/:id') 
        */

        app.get('/booking', verifyJWT, async (req, res) => {
            const patient = req.query.patient;
            const decodedEamil = req.decoded.email;
            if (patient === decodedEamil) {
                const query = { patient: patient };
                const bookings = await bookingCollections.find(query).toArray();
                return res.send(bookings);
            }
            else {
                return res.status(403).send({ message: 'Forbidden Access' })
            }

        })


        // booking api
        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient };
            const exists = await bookingCollections.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingCollections.insertOne(booking);
            return res.send({ success: true, result });
        })

    }
    finally {

    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello from doctors portal')
})

app.listen(port, () => {
    console.log(`doctors portal listening: ${port}`)
})