const express = require('express');
const router = express.Router();
const pricingController = require('../controllers/pricingController');
const { optionalAuth, authenticate, requireEmployer } = require('../middlewares/auth');

router.get('/plans', optionalAuth, pricingController.listPlans);
router.get('/my-subscription', authenticate, requireEmployer, pricingController.getMySubscription);
router.post('/checkout-subscription', authenticate, requireEmployer, pricingController.createCheckoutSubscription);
router.post('/checkout-verify', authenticate, requireEmployer, pricingController.verifyCheckoutSubscription);
router.post('/cancel-subscription', authenticate, requireEmployer, pricingController.cancelMySubscription);

module.exports = router;
