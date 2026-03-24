module.exports = {
  apps: [
    {
      name: 'atrium-server',
      script: 'packages/server/src/index.js',
      cwd: '/home/ec2-user/webapp',
      env: {
        NODE_ENV: 'production',
        WORLD_PATH: 'tests/fixtures/space.gltf'
      },
      node_args: '--experimental-vm-modules',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/home/ec2-user/webapp/logs/atrium-server-error.log',
      out_file: '/home/ec2-user/webapp/logs/atrium-server-out.log',
      merge_logs: true
    }
  ]
}
