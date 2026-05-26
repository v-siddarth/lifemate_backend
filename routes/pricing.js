const express = require('express');
const router = express.Router();
const pricingController = require('../controllers/pricingController');
const { optionalAuth, authenticate, requireEmployer } = require('../middlewares/auth');

router.get('/plans', optionalAuth, pricingController.listPlans);
router.get('/my-subscription', authenticate, pricingController.getMySubscription);
router.post('/checkout-subscription', authenticate, pricingController.createCheckoutSubscription);
router.post('/checkout-verify', authenticate, pricingController.verifyCheckoutSubscription);
router.post('/cancel-subscription', authenticate, requireEmployer, pricingController.cancelMySubscription);

module.exports = router;
