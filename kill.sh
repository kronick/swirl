#!/bin/bash
kill `ps -A|awk '/swirl.fcgi/{print $1}'`
