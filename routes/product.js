// my-product-backend/routes/products.js

const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const Product = require('../models/Product'); // Path to your Product model
const auth = require('../middleware/auth'); // Path to your JWT authentication middleware

// Configure Cloudinary using environment variables
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Multer for memory storage (stores file in buffer)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// POST /api/products - Route to add a new product
// This route is protected by the 'auth' middleware and handles a single file upload named 'imageFile'
router.post('/', auth, upload.single('imageFile'), async (req, res) => {
    try {
        // Ensure the authenticated user is an admin
        // This check assumes your 'auth' middleware adds a 'user' object to req,
        // and that object contains an 'isAdmin' property.
        if (!req.user || !req.user.isAdmin) {
            return res.status(403).json({ message: 'Access denied. Admins only.' });
        }

        // Check if an image file was provided
        if (!req.file) {
            return res.status(400).json({ message: 'No image file uploaded.' });
        }

        // Upload image buffer to Cloudinary
        const uploadResult = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                { folder: 'products' }, // Optional: organize your images in a 'products' folder on Cloudinary
                (error, result) => {
                    if (error) reject(error);
                    resolve(result);
                }
            );
            uploadStream.end(req.file.buffer);
        });

        // Extract other form data from req.body
        const { name, description, price, original_price, quantity, category, subcategory, specs } = req.body;

        // Create a new product instance with data and Cloudinary image URL
        const newProduct = new Product({
            name,
            description,
            price: parseFloat(price), // Ensure price is a number
            original_price: original_price ? parseFloat(original_price) : undefined, // Optional
            quantity: parseInt(quantity), // Ensure quantity is an integer
            category,
            subcategory,
            specs: specs ? specs.split(',').map(s => s.trim()) : [], // Split specs string into an array
            image: uploadResult.secure_url // Store the secure URL from Cloudinary
        });

        // Save the product to MongoDB
        await newProduct.save();

        res.status(201).json(newProduct); // Respond with the newly created product
    } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
});

// GET /api/products - Route to fetch all products (for frontend display)
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 9, search, category } = req.query;
        let query = {};

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { category: { $regex: search, $options: 'i' } },
                { subcategory: { $regex: search, $options: 'i' } },
                { specs: { $regex: search, $options: 'i' } }
            ];
        }

        if (category && category !== 'All') {
            query.category = category;
        }

        const products = await Product.find(query)
                                    .skip((page - 1) * limit)
                                    .limit(parseInt(limit));
        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limit);

        res.status(200).json({
            products,
            currentPage: parseInt(page),
            totalPages,
            totalProducts
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
});

// GET /api/products/:id - Route to fetch a single product by ID
router.get('/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }
        res.status(200).json(product);
    } catch (error) {
        console.error('Error fetching single product:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
});

// PUT /api/products/:id - Route to update a product
router.put('/:id', auth, async (req, res) => {
    try {
        if (!req.user || !req.user.isAdmin) {
            return res.status(403).json({ message: 'Access denied. Admins only.' });
        }

        const { name, description, price, original_price, quantity, category, subcategory, specs } = req.body;
        const updatedProduct = await Product.findByIdAndUpdate(
            req.params.id,
            {
                name,
                description,
                price: parseFloat(price),
                original_price: original_price ? parseFloat(original_price) : undefined,
                quantity: parseInt(quantity),
                category,
                subcategory,
                specs: specs ? specs.split(',').map(s => s.trim()) : []
            },
            { new: true, runValidators: true } // Return the updated document and run schema validators
        );

        if (!updatedProduct) {
            return res.status(404).json({ message: 'Product not found' });
        }

        res.status(200).json(updatedProduct);
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
});

// DELETE /api/products/:id - Route to delete a product
router.delete('/:id', auth, async (req, res) => {
    try {
        if (!req.user || !req.user.isAdmin) {
            return res.status(403).json({ message: 'Access denied. Admins only.' });
        }

        const deletedProduct = await Product.findByIdAndDelete(req.params.id);

        if (!deletedProduct) {
            return res.status(404).json({ message: 'Product not found' });
        }

        res.status(200).json({ message: 'Product deleted successfully' });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
});

// GET /api/categories - Route to fetch all unique categories
router.get('/categories', async (req, res) => {
    try {
        const categories = await Product.distinct('category');
        res.status(200).json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
});


module.exports = router;

app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find({});
        res.json(products);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});











