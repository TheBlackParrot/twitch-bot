# Streamer
1. Navigate to `https://id.twitch.tv/oauth2/authorize?client_id=CLIENT_ID&redirect_uri=http://localhost&response_type=code&scope=channel:manage:broadcast+moderator:manage:shoutouts+user:read:chat+moderator:read:followers+channel:read:ads+channel:read:redemp
tions+channel:manage:redemptions+moderator:manage:chat_messages`
2. Take the given code in the response URL and initiate a POST request to `https://id.twitch.tv/oauth2/token?client_id=CLIENT_ID&client_secret=CLIENT_SECRET&code=CODE_FROM_LAST_REQUEST&grant_type=authorization_code&redirect_uri=http://localhost`
3. Remove any prior token jsons for the saved streamer user
4. Create a `tokens.streamer.json` file with the contents:
```json
{
	"accessToken": <access_token from POST response>,
	"refreshToken": <refresh_token from POST response>,
	"expiresIn": 0,
	"obtainmentTimestamp": 0
}
```

# Bot
1. Navigate to `https://id.twitch.tv/oauth2/authorize?client_id=CLIENT_ID&redirect_uri=http://localhost&response_type=code&scope=user:bot+chat:read+chat:edit`
2. Take the given code in the response URL and initiate a POST request to `https://id.twitch.tv/oauth2/token?client_id=CLIENT_ID&client_secret=CLIENT_SECRET&code=CODE_FROM_LAST_REQUEST&grant_type=authorization_code&redirect_uri=http://localhost`
3. Remove any prior token jsons for the saved streamer user
4. Create a `tokens.streamer.json` file with the contents:
```json
{
	"accessToken": <access_token from POST response>,
	"refreshToken": <refresh_token from POST response>,
	"expiresIn": 0,
	"obtainmentTimestamp": 0
}
```