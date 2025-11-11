#!/bin/bash

if [ -z "$1" ]; then
  echo "Usage: $0 <host>"
  echo "Example: $0 http://localhost:3000"
  exit 1
fi

host=$1

cleanup() {
  echo "Terminating background processes..."
  kill $pid1 $pid2 $pid3 $pid4 $pid5 2>/dev/null
  exit 0
}
trap cleanup SIGINT

execute_curl() {
  curl -s -o /dev/null -w "%{http_code}" "$@"
}

login() {
  local email="$1"
  local password="$2"
  local response
  response=$(curl -s -X PUT "$host/api/auth" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\", \"password\":\"$password\"}")
  echo "$response" | jq -r '.token // .jwt // empty'
}

while true; do
  result=$(execute_curl "$host/api/order/menu")
  echo "Requesting menu... $result"
  sleep 3
done &
pid1=$!

while true; do
  result=$(execute_curl -X PUT "$host/api/auth" \
    -H "Content-Type: application/json" \
    -d '{"email":"unknown@jwt.com", "password":"bad"}')
  echo "Logging in with invalid credentials... $result"
  sleep 25
done &
pid2=$!

while true; do
  token=$(login "f@jwt.com" "franchisee")
  if [ -n "$token" ]; then
    echo "Login franchisee... true"
    sleep 10
    result=$(execute_curl -X GET "$host/api/order/menu" \
      -H "Authorization: Bearer $token")
    echo "Franchisee viewing menu... $result"
    sleep 90
    result=$(execute_curl -X DELETE "$host/api/auth" \
      -H "Authorization: Bearer $token")
    echo "Logging out franchisee... $result"
  else
    echo "Login franchisee... false"
  fi
  sleep 10
done &
pid3=$!

while true; do
  token=$(login "d@jwt.com" "diner")
  if [ -n "$token" ]; then
    echo "Login diner... true"
    result=$(execute_curl -X POST "$host/api/order" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $token" \
      -d '{"franchiseId":1,"storeId":1,"items":[{"menuId":1,"description":"Veggie","price":0.05}]}')
    echo "Bought a pizza... $result"
    sleep 20
    result=$(execute_curl -X DELETE "$host/api/auth" \
      -H "Authorization: Bearer $token")
    echo "Logging out diner... $result"
  else
    echo "Login diner... false"
  fi
  sleep 30
done &
pid4=$!

while true; do
  token=$(login "d@jwt.com" "diner")
  if [ -n "$token" ]; then
    echo "Login hungry diner... true"
    items='{"menuId":1,"description":"Veggie","price":0.05}'
    for ((i=0; i<21; i++)); do
      items+=',{"menuId":1,"description":"Veggie","price":0.05}'
    done
    result=$(execute_curl -X POST "$host/api/order" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $token" \
      -d "{\"franchiseId\":1,\"storeId\":1,\"items\":[${items}]}")
    echo "Bought too many pizzas... $result"
    sleep 5
    result=$(execute_curl -X DELETE "$host/api/auth" \
      -H "Authorization: Bearer $token")
    echo "Logging out hungry diner... $result"
  else
    echo "Login hungry diner... false"
  fi
  sleep 295
done &
pid5=$!

wait $pid1 $pid2 $pid3 $pid4 $pid5
