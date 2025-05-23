/** @type {import('next').NextConfig} */
const nextConfig = {
    transpilePackages: ['@mcp/core'],
    webpack: (config) => {
        // Exclude problematic modules from bundling
        config.externals = [...(config.externals || []), 
            'playwright-core',
            'playwright',
            'electron'
        ];
        return config;
    },
};

module.exports = nextConfig; 