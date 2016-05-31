import requests

api_key = "AIzaSyA7B2nB1Vf9qDp8WTudwBvvbd1Oz2123-A"

channels_url = "https://www.googleapis.com/youtube/v3/channels"
playlistItems_url = "https://www.googleapis.com/youtube/v3/playlistItems"
captions_url = "https://www.googleapis.com/youtube/v3/captions"

headers = {
        'cache-control': "no-cache"
    }


# "id": "UCvQECJukTDE2i6aCoMnS-Vg",
querystring = {
        "part": "contentDetails",
        "forUsername": "bigthink",
        "key": api_key
    }
channel_response = requests.request("GET", channels_url, headers=headers, params=querystring)
print(channel_response.text)

playlistId = channel_response.items[0].contentDetails.relatedPlaylists.uploads


# "pageToken": "CDIQAA",
# "playlistId": "UUvQECJukTDE2i6aCoMnS-Vg",
querystring = {
        "part": "contentDetails",
        "playlistId": playlistId,
        "maxResults": "4",
        "key": api_key
    }
playlist_response = requests.request("GET", playlistItems_url, headers=headers, params=querystring)
print(playlist_response.text)


querystring = {
        "videoId": "3oz7k7Wn_vo",
        "part": "id",
        "key": api_key
    }
response = requests.request("GET", captions_url, headers=headers, params=querystring)
print(response.text)