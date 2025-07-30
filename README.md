We have to solve the following issues:
- requests should come from the genuine application installed on Andoid/IOS. For this, we can use, for example, Play Integrity API that sends signed JWT. In this project, we assume that check will be added to the backend as a middleware afterwards when the user application also is written. Another solution that came to my mind was simply saving secret code both in user application binary and then we check that on backend for a match. Now, as the connection should be HTTPS, this secret seems secure against network attacks. However, it can be easily recovered by an attacker by decompiling the application binary, even if it is obfuscated.
- we have to make it hard for the users to first take picture of a qr-code inside the classroom, and then check in from other places, like from Cafeteria or dorm. For this we have the following safeguards:
  - qr code is displayed by a front-end + backend application inside the class which is listening to changes coming from the server. We have a cron job on server side, which periodically sends new qr codes for each class to corresponding using provided hooks. here class diplay application know that the requests are coming from the backend because they are signed to its secret key. This makes qr code change every 10 minutes for example, which makes it hard to take pictures of qr code one and  then cheat and still get attendance credits even though they are not in class (Ok, this does not make it impossible for one student to actually attend the class and send it to friends, if they can manage that in 10 minutes. The next solution solves that problem)
  - the android application should periodically send heart-beats to the back-end to prove that the student is inside the class. How that works: we assume that the duration of class in 5 divisible in minutes. With that, we decompose the duration into those 5 - minute segments and we keep attendance for each separately: [t_1 = start, t_2) [t_2, t_3) ... [t_{n-1}, t_n = end) and we save what percentage of that segments was attended. For example, if the class spans 30 minutes. we have 6 segments and if the student was present for 4 out of 6 of them, we give her attendance, otherwise no. This ratio should be changable in database configuration and later from admin page. The android application should send this heart-beats every 1 minute for example, to be sure that we take into account network issues or some other technical problems not caused by the student.


## Database Schema

```mermaid
erDiagram
    users {
        varchar user_id PK
        varchar email UK
        varchar password_hash
        text role "CHECK(STUDENT, INSTRUCTOR)"
        varchar first_name
        varchar last_name
        timestamp created_at
    }

    classrooms {
        varchar room_id PK
        decimal gps_lat
        decimal gps_lng
        varchar current_qr_code
        timestamp qr_updated_at
    }

    classes {
        varchar class_id PK
        varchar class_name
        varchar room_id FK
        integer day_of_week
        time start_time
        time end_time
        varchar instructor_id FK
    }

    class_enrollments {
        integer enrollment_id PK
        varchar student_id FK
        varchar class_id FK
        timestamp enrolled_at
    }

    attendance_sessions {
        varchar session_id PK
        varchar student_id FK
        varchar class_id FK
        varchar room_id FK
        timestamp started_at
        timestamp ended_at
        text status "CHECK(ACTIVE, COMPLETED, ABANDONED)"
        integer expected_intervals
    }

    heartbeats {
        integer id PK
        varchar session_id FK
        decimal gps_lat
        decimal gps_lng
        timestamp timestamp
        integer interval_number
        boolean is_valid
    }

    attendance_records {
        varchar student_id PK,FK
        varchar class_id PK,FK
        date date PK
        integer intervals_present
        integer total_intervals
        decimal attendance_percentage
        text status "CHECK(PRESENT, PARTIAL, ABSENT)"
        timestamp created_at
    }

    %% Relationships
    users ||--o{ classes : "instructs"
    users ||--o{ class_enrollments : "enrolls"
    users ||--o{ attendance_sessions : "attends"
    users ||--o{ attendance_records : "has_records"
    
    classrooms ||--o{ classes : "hosts"
    classrooms ||--o{ attendance_sessions : "location"
    
    classes ||--o{ class_enrollments : "has_enrollments"
    classes ||--o{ attendance_sessions : "session_for"
    classes ||--o{ attendance_records : "tracked_in"
    
    attendance_sessions ||--o{ heartbeats : "generates"


![typical_flow](https://github.com/user-attachments/assets/01bedaee-c92a-42ac-af71-0cf0bf37192b)
