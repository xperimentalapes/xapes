# Xperimental Mutant Apes Website

A modern, responsive website for the Xperimental Mutant Apes (XMA) Solana NFT project.

## Features

- **Hero Section**: Prominent mint CTA button
- **About Section**: Project information and tagline
- **Marketplace Links**: Direct links to Magic Eden and Tensor collections
- **Utilities Section**: Links to various project utilities and tools
- **Community Section**: Social media links
- **Responsive Design**: Works on all devices
- **Smooth Animations**: Modern UI interactions and scroll effects

## Setup

1. Open `index.html` in a web browser, or
2. Serve using a local web server:

```bash
# Using Python 3
python3 -m http.server 8000

# Using Node.js (if you have http-server installed)
npx http-server

# Using PHP
php -S localhost:8000
```

Then visit `http://localhost:8000` in your browser.

## Customization

### Update Links

Edit `index.html` to update the following links:

1. **Mint Link** (Hero CTA): Update the `href` in the hero section's mint button
   ```html
   <a href="YOUR_MINT_URL" ...>Mint Now</a>
   ```

2. **Marketplace Links**: Update Magic Eden and Tensor collection URLs
   ```html
   <a href="YOUR_MAGIC_EDEN_URL" ...>Magic Eden</a>
   <a href="YOUR_TENSOR_URL" ...>Tensor</a>
   ```

3. **Utility Links**: Update all utility card links in the utilities section
   - XMA Vault
   - The Lab
   - Lunarverse
   - DEXTools
   - XMA Lock Up
   - Pump.fun
   - LaunchMyNFT

4. **Social Links**: Update Twitter/X and other community links

### Update Content

- Edit the about section text in `index.html`
- Modify project description and tagline
- Update statistics in the hero section

### Styling

- Colors and gradients are defined in `styles.css` using CSS variables
- Modify the `:root` section to change the color scheme
- Adjust spacing, fonts, and sizes as needed

## Project Structure

```
xapes/
├── index.html      # Main HTML file
├── styles.css      # All styling
├── script.js       # JavaScript for interactions
└── README.md       # This file
```

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Notes

- All external links open in new tabs (`target="_blank"`)
- The site uses Google Fonts (Inter) - requires internet connection
- Placeholder links are marked with `#` - replace with actual URLs
- The design is optimized for dark mode/theme

## Deployment

You can deploy this site to:
- **Netlify**: Drag and drop the folder
- **Vercel**: Connect your repository
- **GitHub Pages**: Push to a repository and enable Pages
- **Any static hosting service**

## License

This website is for the Xperimental Mutant Apes project.
