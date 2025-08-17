# Crypto Portfolio Exit Planner

A modern, mobile-first web application for planning and tracking your exit strategy from cryptocurrency markets. Built with vanilla HTML, CSS, and JavaScript.

## Features

### 🎯 Portfolio Overview Dashboard
- **Total Portfolio Value**: Real-time calculation in USD and NOK
- **Total Invested**: Track your initial investment
- **Total P&L**: Profit and loss tracking with color coding
- **Exit Progress**: Overall progress of your exit strategy

### 🔍 Asset Management
- **Intuitive Search**: Search and add popular cryptocurrencies
- **Portfolio Tracking**: Monitor current holdings and values
- **Automatic Updates**: Real-time price updates (simulated)
- **Currency Toggle**: Switch between USD and NOK display

### 📊 Exit Strategy Planning
- **Ladder Exit Strategy**: Create multiple exit levels per asset
- **Price Targets**: Set specific price points for selling
- **Percentage Allocation**: Define what percentage to sell at each level
- **Strategy Summary**: View total exit percentage and average exit price

### 🎨 Modern Design
- **Dark Theme**: Easy on the eyes with a professional look
- **Mobile-First**: Responsive design that works on all devices
- **Smooth Animations**: Modern UI with hover effects and transitions
- **Intuitive Navigation**: Clean, organized interface

## How to Use

### 1. Getting Started
1. Open `index.html` in your web browser
2. The app will load with an empty portfolio
3. Start by adding your first cryptocurrency asset

### 2. Adding Assets
1. **Search**: Type the name or symbol of a cryptocurrency (e.g., "Bitcoin" or "BTC")
2. **Select**: Click on the desired asset from the search results
3. **Enter Details**: 
   - Amount owned (e.g., 0.5 BTC)
   - Average purchase price in USD
4. **Add**: Click "Add to Portfolio"

### 3. Creating Exit Strategies
1. **Click on Asset**: Click any asset card in your portfolio
2. **Add Exit Levels**: Click "Add Exit Level" to create new exit points
3. **Set Parameters**:
   - **Price**: Target price in USD for this exit level
   - **Percentage**: What percentage of remaining holdings to sell
4. **Monitor Progress**: View your exit strategy summary

### 4. Portfolio Management
- **Update Holdings**: Add more of the same asset to update your average price
- **Track Progress**: Monitor your exit strategy progress in real-time
- **Currency Switch**: Toggle between USD and NOK display

## Technical Details

### Built With
- **HTML5**: Semantic markup for accessibility
- **CSS3**: Modern styling with CSS Grid and Flexbox
- **Vanilla JavaScript**: No frameworks or dependencies
- **Local Storage**: Data persistence in your browser

### Browser Support
- Chrome (recommended)
- Firefox
- Safari
- Edge

### Data Storage
- All data is stored locally in your browser's localStorage
- No external servers or data transmission
- Your portfolio data stays private

## Example Exit Strategy

Here's how you might set up a ladder exit strategy for Bitcoin:

1. **Exit Level 1**: Sell 20% at $50,000
2. **Exit Level 2**: Sell 30% at $60,000  
3. **Exit Level 3**: Sell 25% at $75,000
4. **Exit Level 4**: Sell 15% at $100,000
5. **Remaining**: Keep 10% for long-term holding

This creates a systematic approach to taking profits while maintaining some exposure to potential further gains.

## Tips for Effective Exit Planning

### 1. Diversify Exit Points
- Don't put all your eggs in one basket
- Spread exits across multiple price levels
- Consider both profit-taking and loss-cutting levels

### 2. Consider Market Conditions
- Adjust strategies based on market cycles
- Be flexible with your exit points
- Don't be afraid to modify plans as conditions change

### 3. Track Your Progress
- Regularly review your exit strategy
- Monitor how close you are to your targets
- Celebrate when you hit your exit levels

### 4. Stay Disciplined
- Stick to your plan once set
- Don't let emotions drive decisions
- Remember your original investment thesis

## Future Enhancements

Potential features for future versions:
- Real-time price feeds from CoinGecko API
- Historical performance tracking
- Tax loss harvesting suggestions
- Portfolio rebalancing tools
- Export functionality for tax reporting
- Multiple portfolio support
- Advanced charting and analysis

## Privacy & Security

- **No External Data**: All data stays on your device
- **No Registration**: No accounts or personal information required
- **Local Storage**: Data persists between browser sessions
- **Offline Capable**: Works without internet connection

## Support

This is a personal project built for educational and practical purposes. For issues or suggestions, please refer to the code comments or create an issue in the repository.

---

**Disclaimer**: This tool is for educational and planning purposes only. It does not constitute financial advice. Always do your own research and consider consulting with a financial advisor before making investment decisions.

