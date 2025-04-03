const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const bodyParser = require("body-parser");
const dayjs = require("dayjs");

// Create an instance of Express
const app = express();

// Middleware to parse incoming JSON requests
app.use(bodyParser.json());

// MongoDB connection URL (replace with your local MongoDB URL)
const mongoURI = "mongodb://localhost:27017";
const dbName = "cars"; // Replace with your database name
const client = new MongoClient(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Connect to MongoDB
async function connectDB() {
  try {
    await client.connect();
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}

// Call connectDB function to establish MongoDB connection
connectDB();

// Access the database and collections
const db = client.db(dbName);
const carDetailsCollection = db.collection("car_details");
const stockCollection = db.collection("stock");
const salesCollection = db.collection("sales");

// buy a car (POST)
app.post("/buy", async (req, res) => {
  const { carname, quantity } = req.body;
  console.log("Received data:", req.body);

  // Check if  fields are provided
  if (!carname || !quantity) {
    return res.status(400).json({ error: "please fill out both fields" });
  }

  try {
    const stockItem = await stockCollection.findOne({ name: carname });
    console.log(stockItem);

    if (!stockItem) {
      return res.status(404).json({ error: "Car is not found in stock" });
    }
    if (stockItem.stock === 0) {
      return res.status(400).json({ error: "out of stock" });
    }

    // Check if there is enough stock available
    if (stockItem.stock < quantity) {
      return res.status(400).json({ error: "Not enough stock available" });
    }

    const thismonth = dayjs().format("MMMM").toLowerCase();
    const thisyear = dayjs().year();
    // Insert the new order into MongoDB
    const result = await salesCollection.insertOne({
      carname,
      quantity,
      month: thismonth,
      year: thisyear,
    });

    console.log("Insert result:", result);

    if (result.acknowledged && result.insertedId) {
      await stockCollection.updateOne(
        { name: carname },
        { $inc: { stock: -quantity } }
      );
      res.status(200).json({ message: "Car purchased successfully" });
    } else {
      throw new Error("Failed to insert account");
    }
  } catch (err) {
    console.error("Error inserting account:", err);
    res.status(500).json({ error: err.message });
  }
});

// update stock (POST)
app.post("/update_stock", async (req, res) => {
  const { carname, updateQty } = req.body;
  console.log("Received data:", req.body);

  try {
    // Check if  fields are provided
    if (!carname || !updateQty) {
      return res.status(400).json({ error: "please fill out both fields" });
    }
    const updatedDocument = await stockCollection.updateOne(
      { name: carname },
      { $inc: { stock: updateQty } }
    );
    if (updatedDocument.matchedCount > 0 && updatedDocument.modifiedCount > 0) {
      console.log(updatedDocument);

      res.status(200).json({ message: "stock update successfully" });
    } else {
      throw new Error("Failed to update stock");
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// update car details (POST)
app.post("/update_details", async (req, res) => {
  const { carname, newcarname, newprice } = req.body;
  console.log("Received data:", req.body);
  try {
    if (!carname) {
      return res.status(404).json({ error: "car name is required" });
    }
    const findcarcollection = await carDetailsCollection.findOne({
      name: carname,
    });
    console.log(findcarcollection);

    if (!findcarcollection) {
      return res.status(404).json({ error: "Car is not found in stock" });
    }

    // Check if the new car name and price are already the same
    if (
      findcarcollection.name === newcarname &&
      findcarcollection.price === newprice
    ) {
      return res.status(400).json({ error: "No changes detected" });
    }

    const updateFields = {};

    // Conditionally add fields to be updated
    if (newcarname && newcarname !== findcarcollection.name) {
      updateFields.name = newcarname;
    }

    if (newprice && newprice !== findcarcollection.price) {
      updateFields.price = newprice;
    }

    // If no fields need to be updated, send an error response
    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    // Update the car details
    const updatecarname = await carDetailsCollection.updateOne(
      { name: carname },
      { $set: updateFields }
    );
    if (updatecarname.matchedCount > 0 && updatecarname.modifiedCount > 0) {
      console.log(updatecarname);

      res.status(200).json({ message: "cars details update successfully" });
    } else {
      throw new Error("Failed to update car details");
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Route to get sales summary for the current and previous two month (GET)
app.get("/sales-summary", async (req, res) => {
  try {
    // Get the current month and year
    const currentMonth = dayjs().format("MMMM").toLowerCase();

    // Calculate the previous two months
    const previousMonth1 = dayjs()
      .subtract(1, "month")
      .format("MMMM")
      .toLowerCase();
    const previousMonth2 = dayjs()
      .subtract(2, "month")
      .format("MMMM")
      .toLowerCase();

    console.log(`Current month: ${currentMonth}`);
    console.log(`Previous month 1: ${previousMonth1}`);
    console.log(`Previous month 2: ${previousMonth2}`);

    // Fetch sales for the current and previous two months
    const sales = await salesCollection
      .find({
        $or: [
          { month: currentMonth },
          { month: previousMonth1 },
          { month: previousMonth2 },
        ],
      })
      .toArray();

    const cardetails = await carDetailsCollection.find({}).toArray();

    // Convert carDetails to a map for easy lookup
    const carPriceMap = cardetails.reduce((acc, car) => {
      acc[car.name] = car.price;
      return acc;
    }, {});

    console.log(sales);
    console.log(cardetails);
    console.log("Car Price Map:", carPriceMap);

    // Calculate total sales for each of the three months
    const totalSalesPriceCurrentMonth = sales.filter(
      (sale) => sale.month === currentMonth
    );
    const totalSalesPricePreviousMonth1 = sales.filter(
      (sale) => sale.month === previousMonth1
    );
    const totalSalesPricePreviousMonth2 = sales.filter(
      (sale) => sale.month === previousMonth2
    );

    console.log(totalSalesPriceCurrentMonth);
    console.log(totalSalesPricePreviousMonth1);
    console.log(totalSalesPricePreviousMonth2);

    const calculateTotalSalesPrice = (salesdata, finddata) => {
      const monthprice = salesdata.map((item) => {
        if (finddata[item.carname]) {
          const price = item.quantity * finddata[item.carname];
          return price;
        }
      });
      console.log(monthprice);
      const addprice = monthprice.reduce((acc, item) => {
        return acc + item;
      }, 0);
      console.log(addprice);
      return addprice;
    };

    const currentMonthSalesPrice = calculateTotalSalesPrice(
      totalSalesPriceCurrentMonth,
      carPriceMap
    );
    const previousMonth1SalesPrice = calculateTotalSalesPrice(
      totalSalesPricePreviousMonth1,
      carPriceMap
    );
    const previousMonth2SalesPrice = calculateTotalSalesPrice(
      totalSalesPricePreviousMonth2,
      carPriceMap
    );
    console.log(currentMonthSalesPrice);
    console.log(previousMonth1SalesPrice);
    console.log(previousMonth2SalesPrice);

    const threemonth = {
      month: [
        {
          currentmonth: currentMonth,
          currentmonthsale: currentMonthSalesPrice,
        },
        {
          previousmonth1: previousMonth1,
          previousmonth1salesprice: previousMonth1SalesPrice,
        },
        {
          previousmonth2: previousMonth2,
          previousmonth2salesprice: previousMonth2SalesPrice,
        },
      ],
    };

    // Send response with total sales for current month and previous two months
    res.status(200).json({ threemonth });
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).json({ error: "Failed to retrieve sales data" });
  }
});

// Route to get top selling car and qty (GET)
app.get("/top-selling-cars", async (req, res) => {
  try {
    const monthOrder = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
    ];
    // get current year
    const currentYear = dayjs().year();

    // Aggregation pipeline to get top-selling cars and total cars sold per month
    const result = await salesCollection
      .aggregate([
        // Match only sales records for the current year
        {
          $match: {
            year: currentYear, // assuming your sales records have a `year` field
          },
        },
        {
          $group: {
            _id: { month: "$month", carname: "$carname" },
            totalQuantity: { $sum: "$quantity" },
          },
        },
        {
          $sort: { "_id.month": 1, totalQuantity: -1 },
        },
        {
          $group: {
            _id: "$_id.month",
            topCars: {
              $push: {
                carname: "$_id.carname",
                totalQuantity: "$totalQuantity",
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            month: "$_id",
            topCars: {
              $slice: ["$topCars", 3], // Get top 3 cars per month
            },
          },
        },
        {
          $addFields: {
            monthOrderIndex: {
              $indexOfArray: [monthOrder, "$month"],
            },
          },
        },
        {
          $sort: { monthOrderIndex: 1 },
        },
        {
          $project: {
            monthOrderIndex: 0,
          },
        },
      ])
      .toArray();
    const cars = {
      topSellingCars: result,
    };

    // Send the result as JSON
    res.json({ cars });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching top-selling cars.");
  }
});

// route to get top selling cars price (GET)
app.get("/top-selling-cars-price", async (req, res) => {
  try {
    const monthOrder = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
    ];

    // get current year
    const currentYear = dayjs().year();

    // Aggregation pipeline to get top-selling cars and total cars sold per month
    const result = await salesCollection
      .aggregate([
        // Match only sales records for the current year
        {
          $match: {
            year: currentYear, // assuming your sales records have a `year` field
          },
        },
        {
          $group: {
            _id: { month: "$month", carname: "$carname" },
            totalQuantity: { $sum: "$quantity" },
          },
        },
        {
          $sort: { "_id.month": 1, totalQuantity: -1 },
        },
        {
          $group: {
            _id: "$_id.month",
            topCars: {
              $push: {
                carname: "$_id.carname",
                totalQuantity: "$totalQuantity",
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            month: "$_id",
            topCars: {
              $slice: ["$topCars", 3], // Get top 3 cars per month
            },
          },
        },
        {
          $addFields: {
            monthOrderIndex: {
              $indexOfArray: [monthOrder, "$month"],
            },
          },
        },
        {
          $sort: { monthOrderIndex: 1 },
        },
        {
          $project: {
            monthOrderIndex: 0,
          },
        },
      ])
      .toArray();
    console.log(result);

    const cardetails = await carDetailsCollection.find({}).toArray();

    // Convert carDetails to a map for easy lookup
    const carPriceMap = cardetails.reduce((acc, car) => {
      acc[car.name] = car.price;
      return acc;
    }, {});

    const monthprice = {};

    // Function to calculate the total price for top-selling cars
    const calculationprice = (result, carPriceMap) => {
      return result.forEach((item) => {
        const totalPriceForMonth = item.topCars.reduce((acc, topCar) => {
          const carPrice = carPriceMap[topCar.carname];
          if (carPrice) {
            const carTotalPrice = topCar.totalQuantity * carPrice;
            acc.push({
              carname: topCar.carname,
              totalPrice: carTotalPrice,
            });
          }
          return acc;
        }, []);
        monthprice[item.month] = totalPriceForMonth;
      });
    };
    calculationprice(result, carPriceMap);

    // Send the result as JSON
    res.json({ monthprice });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching top-selling cars.");
  }
});

// Route to get top saleing car in yearly and quantity (GET)
app.get("/yearly_sale", async (req, res) => {
  try {
    const currentYear = dayjs().year();

    // Aggregation to get top 4 cars by quantity
    const topCars = await salesCollection
      .aggregate([
        {
          $match: { year: currentYear },
        },
        {
          $group: {
            _id: "$carname",
            totalQuantity: { $sum: "$quantity" },
          },
        },
        {
          $project: {
            name: "$_id",
            totalQuantity: 1,
            _id: 0,
          },
        },
        {
          $sort: { totalQuantity: -1 },
        },
        {
          $limit: 4,
        },
      ])
      .toArray();

    const yearlytopcars = {
      topCars: topCars,
    };

    res.status(200).json({ yearlytopcars });
  } catch (err) {
    console.error("Error fetching top cars:", err);
    res.status(500).json({ error: err.message });
  }
});
// Start the server
const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
