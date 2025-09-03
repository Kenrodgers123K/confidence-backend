const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    original_price: { type: Number },
    quantity: { type: Number, required: true, default: 0 },
    category: { type: String, required: true },
    subcategory: { type: String, required: true },
    image: { type: String, required: true },
    specs: { type: [String] }
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);

module.exports = Product;