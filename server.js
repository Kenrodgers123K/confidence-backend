require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// --- Import Schemas and Middleware ---
const Product = require('./models/Product');
const User = require('./models/User');
const { authenticateToken, authorizeRole } = require('./middleware/auth');

const app = express();
const port = process.env.PORT || 5000;

// --- Middleware ---
app.use(cors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Cloudinary Configuration ---
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// --- MongoDB Connection ---
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB connected successfully!'))
    .catch(err => console.error('MongoDB connection error:', err));

// --- Multer for file uploads ---
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- JWT Secret ---
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('FATAL ERROR: JWT_SECRET is not defined in .env file!');
    process.exit(1);
}

// --- Authentication Routes ---
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, role } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }

        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(409).json({ message: 'Username already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword, role: role || 'user' });
        await newUser.save();
        res.status(201).json({ message: 'User registered successfully', userId: newUser._id, username: newUser.username });
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }

        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user._id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.status(200).json({ message: 'Login successful', token, role: user.role });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

app.get('/api/auth/verify', authenticateToken, (req, res) => {
    res.status(200).json({ 
        isValid: true, 
        username: req.user.username, 
        role: req.user.role,
        isAdmin: req.user.role === 'admin' 
    });
});

// --- Product Management Routes ---
app.post('/api/products', authenticateToken, authorizeRole(['admin']), upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No image file uploaded' });
        }

        const result = await cloudinary.uploader.upload(`data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`, {
            folder: 'product_images',
        });

        const { name, description, price, originalPrice, quantity, category, subCategory, specs } = req.body;
        
        if (!name || !description || !price || !quantity || !category || !subCategory) {
            return res.status(400).json({ message: 'Missing required product fields: name, description, price, quantity, category, subCategory' });
        }

        const newProduct = new Product({
            name,
            description,
            price: parseFloat(price),
            original_price: originalPrice ? parseFloat(originalPrice) : undefined,
            quantity: parseInt(quantity),
            category,
            subcategory: subCategory,
            image: result.secure_url,
            specs: specs ? JSON.parse(specs) : []
        });

        await newProduct.save();
        res.status(201).json(newProduct);

    } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

app.get('/api/products', async (req, res) => {
    try {
        const { page, limit = 9999, search, category } = req.query;
        let query = {};

        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { name: searchRegex },
                { description: searchRegex },
                { category: searchRegex },
                { subcategory: searchRegex },
                { specs: searchRegex }
            ];
        }

        if (category && category !== 'All') {
            query.category = category;
        }

        const products = await Product.find(query)
                                    .skip((parseInt(page) - 1) * parseInt(limit))
                                    .limit(parseInt(limit))
                                    .sort({ createdAt: -1 });

        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / parseInt(limit));

        res.status(200).json({
            products,
            currentPage: parseInt(page),
            totalPages,
            totalProducts
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

app.get('/api/products/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }
        res.status(200).json(product);
    } catch (error) {
        console.error('Error fetching product by ID:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: 'Invalid product ID format' });
        }
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

app.put('/api/products/:id', authenticateToken, authorizeRole(['admin']), upload.single('image'), async (req, res) => {
    try {
        const { name, description, price, originalPrice, quantity, category, subCategory, specs } = req.body;
        let image = req.body.imageUrl;

        if (req.file) {
            const result = await cloudinary.uploader.upload(`data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`, {
                folder: 'product_images',
            });
            image = result.secure_url;
        }

        const updatedProduct = await Product.findByIdAndUpdate(
            req.params.id,
            {
                name,
                description,
                price: parseFloat(price),
                original_price: originalPrice ? parseFloat(originalPrice) : undefined,
                quantity: parseInt(quantity),
                category,
                subcategory: subCategory,
                specs: specs ? JSON.parse(specs) : [],
                image
            },
            { new: true, runValidators: true }
        );

        if (!updatedProduct) {
            return res.status(404).json({ message: 'Product not found' });
        }
        res.status(200).json(updatedProduct);
    } catch (error) {
        console.error('Error updating product:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: 'Invalid product ID format' });
        }
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

app.delete('/api/products/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
    try {
        const deletedProduct = await Product.findByIdAndDelete(req.params.id);
        if (!deletedProduct) {
            return res.status(404).json({ message: 'Product not found' });
        }
        res.status(200).json({ message: 'Product deleted successfully' });
    } catch (error) {
        console.error('Error deleting product:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: 'Invalid product ID format' });
        }
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

app.get('/api/categories', async (req, res) => {
    try {
        const categories = await Product.distinct('category');
        res.status(200).json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

app.get('/', (req, res) => {
    res.send('Confidence Supplies Backend API is running!');
});

// --- Start Server ---
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});