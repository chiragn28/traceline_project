FROM postgres:16

# Simulates a customer's Postgres instance with stock csvlog auditing turned
# on via plain command-line flags (no config file path assumptions, no
# extensions). This is the only "connector surface" Traceline touches: a
# passive log file, never a proxy sitting in front of the customer's queries.
COPY init.sql /docker-entrypoint-initdb.d/01-init.sql
COPY entrypoint-wrapper.sh /usr/local/bin/entrypoint-wrapper.sh
RUN chmod +x /usr/local/bin/entrypoint-wrapper.sh

ENTRYPOINT ["entrypoint-wrapper.sh"]
CMD ["postgres", \
     "-c", "logging_collector=on", \
     "-c", "log_destination=csvlog", \
     "-c", "log_statement=all", \
     "-c", "log_connections=on", \
     "-c", "log_disconnections=on", \
     "-c", "log_directory=/var/log/postgresql", \
     "-c", "log_filename=postgresql-%Y-%m-%d_%H%M%S.log", \
     "-c", "log_rotation_age=1440", \
     "-c", "log_rotation_size=0", \
     "-c", "log_truncate_on_rotation=off"]
